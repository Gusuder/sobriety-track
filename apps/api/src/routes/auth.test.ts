import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { authRoutes } from './auth.js';
import { pool } from '../db/pool.js';

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
