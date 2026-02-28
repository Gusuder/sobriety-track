import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';

const registerSchema = z.object({
  login: z.string().min(3).max(100),
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(8)
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(12),
  newPassword: z.string().min(8)
});

const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { login, email, password } = parsed.data;
    const passwordHash = await hashPassword(password);

    try {
      const result = await pool.query(
        `INSERT INTO users (login, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, login, email, created_at`,
        [login, email, passwordHash]
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

  app.post('/auth/forgot-password', async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { email } = parsed.data;
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0] as { id: number } | undefined;

    if (!user) {
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

