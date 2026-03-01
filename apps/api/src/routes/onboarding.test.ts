import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { onboardingRoutes } from './onboarding.js';
import { pool } from '../db/pool.js';

type DbClientMock = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }>;
  release: () => void;
};

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request) => {
    request.user = { userId: 1, login: 'demo' };
  });
  app.register(onboardingRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

test('POST /api/onboarding validates payload', async () => {
  const originalConnect = pool.connect;
  (pool as any).connect = async () => {
    throw new Error('connect should not be called for invalid payload');
  };

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/onboarding',
    payload: { startMode: 'already_sober', goalDays: 30 }
  });

  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, 'Invalid payload');

  await app.close();
  (pool as any).connect = originalConnect;
});

test('POST /api/onboarding creates profile and active goal when missing', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];

  (pool as any).query = async () => ({ rows: [], rowCount: 0 });

  const client: DbClientMock = {
    async query(sql, params) {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO user_profiles')) {
        return { rows: [{ user_id: 1, current_goal_days: 30 }], rowCount: 1 };
      }

      if (sql.includes('FROM goals') && sql.includes('is_active = TRUE')) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO goals')) {
        return { rows: [{ id: 10, target_days: 30, is_active: true }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {}
  };

  (pool as any).connect = async () => client;

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/onboarding',
    payload: { startMode: 'now', goalDays: 30 }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.profile.user_id, 1);
  assert.equal(body.goal.target_days, 30);
  assert.ok(calls.some((c) => c.sql === 'COMMIT'));

  await app.close();
  (pool as any).connect = originalConnect;
  (pool as any).query = originalQuery;
});

test('POST /api/onboarding updates active goal target when it already exists', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];

  (pool as any).query = async () => ({ rows: [], rowCount: 0 });

  const client: DbClientMock = {
    async query(sql, params) {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO user_profiles')) {
        return { rows: [{ user_id: 1, current_goal_days: 365 }], rowCount: 1 };
      }

      if (sql.includes('FROM goals') && sql.includes('is_active = TRUE')) {
        return { rows: [{ id: 77 }], rowCount: 1 };
      }

      if (sql.includes('UPDATE goals')) {
        return { rows: [{ id: 77, target_days: 365, is_active: true }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {}
  };

  (pool as any).connect = async () => client;

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/onboarding',
    payload: { startMode: 'already_sober', soberStartDate: '2026-02-01', goalDays: 365 }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.profile.current_goal_days, 365);
  assert.equal(body.goal.target_days, 365);
  assert.ok(calls.some((c) => c.sql.includes('UPDATE goals')));

  await app.close();
  (pool as any).connect = originalConnect;
  (pool as any).query = originalQuery;
});

test('POST /api/onboarding allows startMode=now with goal 1 even when entries exist', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];

  const today = new Date().toISOString().slice(0, 10);
  (pool as any).query = async () => ({
    rows: [{ entry_date: today, drank: false }],
    rowCount: 1
  });

  const client: DbClientMock = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO user_profiles')) return { rows: [{ user_id: 1, current_goal_days: 1 }], rowCount: 1 };
      if (sql.includes('FROM goals') && sql.includes('is_active = TRUE')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO goals')) return { rows: [{ id: 33, target_days: 1, is_active: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  (pool as any).connect = async () => client;

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/onboarding',
    payload: { startMode: 'now', goalDays: 1 }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(calls.some((c) => c.sql === 'COMMIT'));

  await app.close();
  (pool as any).connect = originalConnect;
  (pool as any).query = originalQuery;
});

test('POST /api/onboarding rejects goal lower than current streak', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const today = new Date();
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - 7);
  const startedAt = startDate.toISOString().slice(0, 10);

  (pool as any).connect = async () => {
    throw new Error('connect should not be called when goal is invalid');
  };
  (pool as any).query = async () => ({ rows: [], rowCount: 0 });

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/onboarding',
    payload: { startMode: 'already_sober', soberStartDate: startedAt, goalDays: 3 }
  });

  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(typeof body.currentStreak, 'number');
  assert.ok(body.currentStreak >= 7);

  await app.close();
  (pool as any).connect = originalConnect;
  (pool as any).query = originalQuery;
});

test('POST /api/onboarding rejects goal equal to current streak', async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const today = new Date();
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - 10);
  const startedAt = startDate.toISOString().slice(0, 10);

  (pool as any).connect = async () => {
    throw new Error('connect should not be called when goal is invalid');
  };
  (pool as any).query = async () => ({ rows: [], rowCount: 0 });

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/onboarding',
    payload: { startMode: 'already_sober', soberStartDate: startedAt, goalDays: 10 }
  });

  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.currentStreak, 10);

  await app.close();
  (pool as any).connect = originalConnect;
  (pool as any).query = originalQuery;
});

test('GET /api/onboarding returns profile', async () => {
  const originalQuery = pool.query;
  (pool as any).query = async () => ({
    rows: [{ user_id: 1, current_goal_days: 45 }],
    rowCount: 1
  });

  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/onboarding' });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.profile.current_goal_days, 45);

  await app.close();
  (pool as any).query = originalQuery;
});
