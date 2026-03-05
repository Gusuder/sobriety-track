import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { __setGoogleVerifierForTests, authRoutes } from './auth.js';
import { pool } from '../db/pool.js';
import { hashPassword } from '../utils/hash.js';

async function buildApp() {
  const app = Fastify();
  app.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'test-secret-123' });
  app.register(authRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

test('POST /api/auth/login rate-limits after 10 attempts per IP', async () => {
  const originalQuery = pool.query;
  (pool as any).query = async () => ({ rows: [], rowCount: 0 });

  const app = await buildApp();
  const payload = { login: 'demo-user', password: 'StrongPass123!' };

  for (let i = 0; i < 10; i += 1) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload,
      remoteAddress: '10.10.0.1'
    });
    assert.equal(res.statusCode, 401);
  }

  const limited = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload,
    remoteAddress: '10.10.0.1'
  });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error, 'Too many requests. Please try again later.');
  assert.ok(Number(limited.headers['retry-after']) >= 1);

  await app.close();
  (pool as any).query = originalQuery;
});

test('POST /api/auth/register rate-limits after 20 valid attempts per IP', async () => {
  const originalQuery = pool.query;
  let userId = 0;
  (pool as any).query = async () => {
    userId += 1;
    return {
      rows: [
        {
          id: userId,
          login: `user_${userId}`,
          email: `user_${userId}@example.com`,
          display_name: 'User',
          created_at: new Date().toISOString()
        }
      ],
      rowCount: 1
    };
  };

  const app = await buildApp();
  const basePayload = {
    displayName: 'New User',
    password: 'StrongPass123!'
  };

  for (let i = 0; i < 20; i += 1) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        ...basePayload,
        login: `new_user_${i}`,
        email: `new_user_${i}@example.com`
      },
      remoteAddress: '10.10.0.2'
    });
    assert.equal(res.statusCode, 201);
  }

  const limited = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      ...basePayload,
      login: 'new_user_limited',
      email: 'new_user_limited@example.com'
    },
    remoteAddress: '10.10.0.2'
  });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error, 'Too many requests. Please try again later.');
  assert.ok(Number(limited.headers['retry-after']) >= 1);

  await app.close();
  (pool as any).query = originalQuery;
});

test('POST /api/auth/register rate-limits by identity after 5 attempts', async () => {
  const originalQuery = pool.query;
  let userId = 0;
  (pool as any).query = async () => {
    userId += 1;
    return {
      rows: [
        {
          id: userId,
          login: `same_user_${userId}`,
          email: `same_user_${userId}@example.com`,
          display_name: 'User',
          created_at: new Date().toISOString()
        }
      ],
      rowCount: 1
    };
  };

  const app = await buildApp();
  const payload = {
    displayName: 'Same Identity User',
    password: 'StrongPass123!',
    login: 'same_identity_login',
    email: 'same_identity@example.com'
  };

  for (let i = 0; i < 5; i += 1) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload,
      remoteAddress: `10.10.0.${10 + i}`
    });
    assert.equal(res.statusCode, 201);
  }

  const limited = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload,
    remoteAddress: '10.10.0.20'
  });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error, 'Too many requests. Please try again later.');
  assert.ok(Number(limited.headers['retry-after']) >= 1);

  await app.close();
  (pool as any).query = originalQuery;
});

test('POST /api/auth/register invalid payload does not consume rate limit', async () => {
  const app = await buildApp();

  for (let i = 0; i < 20; i += 1) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {},
      remoteAddress: '10.10.0.3'
    });
    assert.equal(res.statusCode, 400);
  }

  await app.close();
});

test('POST /api/auth/google signs in existing user by verified google email', async () => {
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  __setGoogleVerifierForTests(async () => ({
    email: 'google_user@example.com',
    displayName: 'Google User'
  }));

  const originalQuery = pool.query;
  let selectCalls = 0;
  (pool as any).query = async (sql: string) => {
    if (sql.includes('FROM users WHERE email')) {
      selectCalls += 1;
      return {
        rows: [
          {
            id: 101,
            login: 'google_user',
            email: 'google_user@example.com',
            display_name: 'Google User'
          }
        ],
        rowCount: 1
      };
    }
    if (sql.startsWith('UPDATE users SET display_name')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/google',
    payload: { idToken: 'x'.repeat(24) },
    remoteAddress: '10.10.1.1'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  assert.equal(selectCalls >= 1, true);

  await app.close();
  (pool as any).query = originalQuery;
  __setGoogleVerifierForTests(null);
  process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
});

test('POST /api/auth/google returns 401 for invalid token', async () => {
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  __setGoogleVerifierForTests(async () => {
    throw new Error('invalid token');
  });

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/google',
    payload: { idToken: 'x'.repeat(24) },
    remoteAddress: '10.10.1.2'
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'Invalid Google token');

  await app.close();
  __setGoogleVerifierForTests(null);
  process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
});

test('GET /api/auth/google/config returns oauth config state', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/google/config'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.json().enabled, 'boolean');
  assert.equal(typeof res.json().clientId, 'string');

  await app.close();
});

test('POST /api/auth/login sets auth cookies and csrf token on success', async () => {
  const originalQuery = pool.query;
  const password = 'StrongPass123!';
  const passwordHash = await hashPassword(password);

  (pool as any).query = async (sql: string) => {
    if (sql.includes('SELECT id, login, password_hash FROM users WHERE login = $1')) {
      return { rows: [{ id: 901, login: 'demo-user', password_hash: passwordHash }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'demo-user', password },
    remoteAddress: '10.10.0.9'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  assert.ok(typeof res.json().csrfToken === 'string');

  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? '')];
  assert.ok(cookies.some((c) => c.includes('access_token=')));
  assert.ok(cookies.some((c) => c.includes('csrf_token=')));

  await app.close();
  (pool as any).query = originalQuery;
});

test('POST /api/auth/google creates new user with google provider when email is missing', async () => {
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  __setGoogleVerifierForTests(async () => ({
    email: 'fresh_google_user@example.com',
    displayName: 'Fresh Google User'
  }));

  const originalQuery = pool.query;
  let insertSql = '';
  (pool as any).query = async (sql: string) => {
    if (sql.includes('FROM users WHERE email')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO users')) {
      insertSql = sql;
      return {
        rows: [
          {
            id: 202,
            login: 'fresh_google_user',
            email: 'fresh_google_user@example.com',
            display_name: 'Fresh Google User',
            auth_provider: 'google'
          }
        ],
        rowCount: 1
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/google',
    payload: { idToken: 'x'.repeat(24) },
    remoteAddress: '10.10.1.3'
  });

  assert.equal(res.statusCode, 200);
  assert.ok(insertSql.includes("auth_provider"));
  assert.equal(res.json().ok, true);

  await app.close();
  (pool as any).query = originalQuery;
  __setGoogleVerifierForTests(null);
  process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
});

test('POST /api/auth/forgot-password for google provider does not return reset token', async () => {
  const originalQuery = pool.query;
  (pool as any).query = async (sql: string) => {
    if (sql.includes('FROM users WHERE email')) {
      return { rows: [{ id: 303, auth_provider: 'google' }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO password_reset_tokens')) {
      throw new Error('reset token insert should not be called for google provider');
    }
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/forgot-password',
    payload: { email: 'fresh_google_user@example.com' },
    remoteAddress: '10.10.1.4'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  assert.equal(res.json().resetToken, undefined);

  await app.close();
  (pool as any).query = originalQuery;
});
