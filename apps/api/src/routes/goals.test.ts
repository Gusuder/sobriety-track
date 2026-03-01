import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { goalsRoutes } from './goals.js';
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
  app.register(goalsRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

test('POST /api/goals validates payload', async () => {
  const originalConnect = pool.connect;
  (pool as any).connect = async () => {
    throw new Error('connect should not be called for invalid payload');
  };

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/goals',
    payload: { targetDays: 0 }
  });

  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, 'Invalid payload');

  await app.close();
  (pool as any).connect = originalConnect;
});

test('POST /api/goals creates a new active goal', async () => {
  const originalConnect = pool.connect;
  const calls: string[] = [];

  const client: DbClientMock = {
    async query(sql) {
      calls.push(sql);

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO goals')) {
        return { rows: [{ id: 7, target_days: 45, is_active: true }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {}
  };

  (pool as any).connect = async () => client;

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/goals',
    payload: { targetDays: 45 }
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.goal.target_days, 45);
  assert.ok(calls.includes('COMMIT'));

  await app.close();
  (pool as any).connect = originalConnect;
});

test('GET /api/goals returns active goal with progress', async () => {
  const originalQuery = pool.query;
  const today = new Date().toISOString().slice(0, 10);

  let queryCount = 0;
  (pool as any).query = async () => {
    queryCount += 1;
    if (queryCount === 1) {
      return {
        rows: [{ id: 1, target_days: 10, is_active: true }],
        rowCount: 1
      };
    }

    if (queryCount === 2) {
      return {
        rows: [{ entry_date: today, drank: false }],
        rowCount: 1
      };
    }

    return {
      rows: [{ started_at: today, started_with_existing_streak: false }],
      rowCount: 1
    };
  };

  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/goals' });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.activeGoal.target_days, 10);
  assert.equal(body.progress.targetDays, 10);
  assert.equal(body.progress.streakDays, 1);

  await app.close();
  (pool as any).query = originalQuery;
});
