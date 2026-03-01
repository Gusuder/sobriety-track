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
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];

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
