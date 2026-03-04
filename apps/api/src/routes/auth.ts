import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';
import { getRateLimitStore } from '../utils/rate-limit-store.js';

const registerSchema = z.object({
  login: z.string().min(3).max(100),
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  password: z.string().min(8)
});

const loginSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(8)
});

const googleAuthSchema = z.object({
  idToken: z.string().min(20)
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(12),
  newPassword: z.string().min(8)
});

const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');
const authRateLimits = {
  registerPerIp: { maxRequests: 20, windowMs: 10 * 60 * 1000 },
  registerPerIdentity: { maxRequests: 5, windowMs: 30 * 60 * 1000 },
  login: { maxRequests: 10, windowMs: 15 * 60 * 1000 },
  googleAuth: { maxRequests: 20, windowMs: 15 * 60 * 1000 },
  forgotPassword: { maxRequests: 5, windowMs: 15 * 60 * 1000 },
  resetPassword: { maxRequests: 10, windowMs: 15 * 60 * 1000 }
} as const;
const rateLimitStorePromise = getRateLimitStore(env.REDIS_URL);
const googleClient = new OAuth2Client();

type GoogleProfile = {
  email: string;
  displayName: string;
};

let googleTokenVerifier = async (idToken: string): Promise<GoogleProfile> => {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth is not configured');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();

  if (!payload?.email || !payload.email_verified) {
    throw new Error('Google token does not contain a verified email');
  }

  return {
    email: payload.email.toLowerCase(),
    displayName: (payload.name ?? payload.given_name ?? payload.email.split('@')[0]).slice(0, 120)
  };
};

export function __setGoogleVerifierForTests(
  verifier: ((idToken: string) => Promise<GoogleProfile>) | null
) {
  if (verifier) {
    googleTokenVerifier = verifier;
    return;
  }
  googleTokenVerifier = async (idToken: string): Promise<GoogleProfile> => {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new Error('Google OAuth is not configured');
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      throw new Error('Google token does not contain a verified email');
    }

    return {
      email: payload.email.toLowerCase(),
      displayName: (payload.name ?? payload.given_name ?? payload.email.split('@')[0]).slice(0, 120)
    };
  };
}

function registerIdentityKey(login: string, email: string) {
  const normalized = `${login.trim().toLowerCase()}|${email.trim().toLowerCase()}`;
  return createHash('sha256').update(normalized).digest('hex');
}

function makeLoginCandidateFromEmail(email: string) {
  const local = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (local.length >= 3) {
    return local.slice(0, 100);
  }

  return `user_${randomBytes(4).toString('hex')}`.slice(0, 100);
}

async function applyAuthRateLimit(
  reply: FastifyReply,
  key: string,
  config: { maxRequests: number; windowMs: number }
) {
  const store = await rateLimitStorePromise;
  const result = await store.increment(`auth:rate:${key}`, config.windowMs);

  if (result.count > config.maxRequests) {
    const retryAfter = result.retryAfterSec;
    reply.header('Retry-After', String(retryAfter));
    reply.status(429).send({
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_AUTH',
      retryAfterSec: retryAfter
    });
    return true;
  }

  return false;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/google/config', async () => {
    return {
      enabled: Boolean(env.GOOGLE_CLIENT_ID),
      clientId: env.GOOGLE_CLIENT_ID ?? ''
    };
  });

  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    if (await applyAuthRateLimit(reply, `register-ip:${request.ip}`, authRateLimits.registerPerIp)) {
      return;
    }

    const { login, email, displayName, password } = parsed.data;
    const identityKey = registerIdentityKey(login, email);
    if (
      await applyAuthRateLimit(reply, `register-identity:${identityKey}`, authRateLimits.registerPerIdentity)
    ) {
      return;
    }

    const passwordHash = await hashPassword(password);

    try {
      const result = await pool.query(
        `INSERT INTO users (login, email, display_name, password_hash, auth_provider)
         VALUES ($1, $2, $3, $4, 'password')
         RETURNING id, login, email, display_name, created_at`,
        [login, email, displayName, passwordHash]
      );

      return reply.status(201).send({ user: result.rows[0] });
    } catch (error: any) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: 'Login or email already exists' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.post('/auth/login', async (request, reply) => {
    if (await applyAuthRateLimit(reply, `login:${request.ip}`, authRateLimits.login)) {
      return;
    }
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { login, password } = parsed.data;

    const result = await pool.query('SELECT id, login, password_hash FROM users WHERE login = $1', [login]);
    const user = result.rows[0];

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ userId: user.id, login: user.login });
    return reply.send({ accessToken: token });
  });

  app.post('/auth/google', async (request, reply) => {
    if (!env.GOOGLE_CLIENT_ID) {
      return reply.status(503).send({ error: 'Google OAuth is not configured' });
    }
    if (await applyAuthRateLimit(reply, `google:${request.ip}`, authRateLimits.googleAuth)) {
      return;
    }

    const parsed = googleAuthSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    let profile: GoogleProfile;
    try {
      profile = await googleTokenVerifier(parsed.data.idToken);
    } catch (error) {
      request.log.warn({ error }, 'Google token verification failed');
      return reply.status(401).send({ error: 'Invalid Google token' });
    }

    try {
      let userResult = await pool.query(
        'SELECT id, login, email, display_name, auth_provider FROM users WHERE email = $1 LIMIT 1',
        [profile.email]
      );

      if (userResult.rowCount === 0) {
        const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
        const loginBase = makeLoginCandidateFromEmail(profile.email);
        let created = false;

        for (let i = 0; i < 8 && !created; i += 1) {
          const suffix = i === 0 ? '' : `_${randomBytes(2).toString('hex')}`;
          const login = `${loginBase}${suffix}`.slice(0, 100);
          try {
            userResult = await pool.query(
              `INSERT INTO users (login, email, display_name, password_hash, auth_provider)
               VALUES ($1, $2, $3, $4, 'google')
               RETURNING id, login, email, display_name, auth_provider`,
              [login, profile.email, profile.displayName, passwordHash]
            );
            created = true;
          } catch (insertError: any) {
            if (insertError.code !== '23505') {
              throw insertError;
            }
          }
        }

        if (!created) {
          userResult = await pool.query(
            'SELECT id, login, email, display_name, auth_provider FROM users WHERE email = $1 LIMIT 1',
            [profile.email]
          );
        }
      }

      const user = userResult.rows[0];
      if (!user) {
        return reply.status(500).send({ error: 'Internal server error' });
      }

      if (!user.display_name && profile.displayName) {
        await pool.query('UPDATE users SET display_name = $1 WHERE id = $2', [profile.displayName, user.id]);
      }

      const token = app.jwt.sign({ userId: user.id, login: user.login });
      return reply.send({ accessToken: token, user });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.post('/auth/forgot-password', async (request, reply) => {
    if (await applyAuthRateLimit(reply, `forgot:${request.ip}`, authRateLimits.forgotPassword)) {
      return;
    }
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { email } = parsed.data;
    const userResult = await pool.query('SELECT id, auth_provider FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0] as { id: number; auth_provider?: string } | undefined;

    if (!user) {
      return reply.send({ ok: true, message: 'If email exists, reset instructions were sent.' });
    }
    if (user.auth_provider === 'google') {
      return reply.send({ ok: true, message: 'If email exists, reset instructions were sent.' });
    }

    const resetToken = randomBytes(24).toString('hex');
    const tokenHash = hashResetToken(resetToken);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [user.id, tokenHash]
    );

    return reply.send({
      ok: true,
      message: 'Reset token created (MVP dev mode).',
      resetToken
    });
  });

  app.post('/auth/reset-password', async (request, reply) => {
    if (await applyAuthRateLimit(reply, `reset:${request.ip}`, authRateLimits.resetPassword)) {
      return;
    }
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { token, newPassword } = parsed.data;
    const tokenHash = hashResetToken(token);

    const tokenResult = await pool.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       ORDER BY id DESC
       LIMIT 1`,
      [tokenHash]
    );

    const resetRow = tokenResult.rows[0] as { id: number; user_id: number } | undefined;
    if (!resetRow) {
      return reply.status(400).send({ error: 'Invalid or expired reset token' });
    }

    const newPasswordHash = await hashPassword(newPassword);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, resetRow.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [resetRow.id]);

    return reply.send({ ok: true, message: 'Password updated successfully' });
  });
};
