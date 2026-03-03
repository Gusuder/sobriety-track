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

test('POST /api/auth/register rate-limits after 5 attempts per IP', async () => {
  const app = await buildApp();

  for (let i = 0; i < 5; i += 1) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {},
      remoteAddress: '10.10.0.2'
    });
    assert.equal(res.statusCode, 400);
  }

  const limited = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {},
    remoteAddress: '10.10.0.2'
  });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error, 'Too many requests. Please try again later.');
  assert.ok(Number(limited.headers['retry-after']) >= 1);

  await app.close();
});
