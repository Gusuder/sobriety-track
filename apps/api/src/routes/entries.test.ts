import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { entriesRoutes } from './entries.js';
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
  app.register(entriesRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

test('GET /api/entries/reasons returns reasons list', async () => {
  const originalQuery = pool.query;
  (pool as any).query = async () => ({
    rows: [{ code: 'stress', title: 'Stress' }],
    rowCount: 1
  });

  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/entries/reasons' });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.reasons[0].code, 'stress');

  await app.close();
  (pool as any).query = originalQuery;
});

test('POST /api/entries validates payload', async () => {
  const originalConnect = pool.connect;
  (pool as any).connect = async () => {
    throw new Error('connect should not be called for invalid payload');
  };

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/entries',
    payload: {
      entryDate: '2026-03-01',
      drank: false,
      mood: 'good',
      stressLevel: 11,
      cravingLevel: 4,
      daySummary: 'x'
    }
  });

  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, 'Invalid payload');

  await app.close();
  (pool as any).connect = originalConnect;
});

test('POST /api/entries creates entry and deduplicates reason codes', async () => {
  const originalConnect = pool.connect;
  const queryCalls: Array<{ sql: string; params: unknown[] | undefined }> = [];

  const client: DbClientMock = {
    async query(sql, params) {
      queryCalls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO daily_entries')) {
        return { rows: [{ id: 9, entry_date: '2026-03-01' }], rowCount: 1 };
      }

      if (sql.includes('DELETE FROM entry_reasons')) {
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO entry_reasons')) {
        return { rows: [], rowCount: 2 };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {}
  };

  (pool as any).connect = async () => client;

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/entries',
    payload: {
      entryDate: '2026-03-01',
      drank: false,
      mood: 'good',
      stressLevel: 3,
      cravingLevel: 4,
      daySummary: 'ok',
      comment: 'fine',
      reasonCodes: ['stress', 'boredom', 'stress']
    }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.reasonCodes, ['stress', 'boredom']);
  assert.ok(queryCalls.some((c) => c.sql === 'COMMIT'));
  assert.ok(queryCalls.some((c) => c.sql.includes('DELETE FROM entry_reasons')));

  await app.close();
  (pool as any).connect = originalConnect;
});

test('POST /api/entries updates existing day entry via upsert', async () => {
  const originalConnect = pool.connect;
  const queryCalls: Array<{ sql: string; params: unknown[] | undefined }> = [];

  const client: DbClientMock = {
    async query(sql, params) {
      queryCalls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO daily_entries')) {
        return { rows: [{ id: 10, entry_date: '2026-03-01', mood: 'neutral' }], rowCount: 1 };
      }

      if (sql.includes('DELETE FROM entry_reasons')) {
        return { rows: [], rowCount: 2 };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {}
  };

  (pool as any).connect = async () => client;

  const app = await buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/entries',
    payload: {
      entryDate: '2026-03-01',
      drank: false,
      mood: 'neutral',
      stressLevel: 3,
      cravingLevel: 4,
      daySummary: 'ok'
    }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.entry.id, 10);
  assert.ok(queryCalls.some((c) => c.sql.includes('ON CONFLICT (user_id, entry_date)')));
  assert.ok(queryCalls.some((c) => c.sql === 'COMMIT'));

  await app.close();
  (pool as any).connect = originalConnect;
});

test('GET /api/entries validates query', async () => {
  const originalQuery = pool.query;
  (pool as any).query = async () => {
    throw new Error('query should not be called for invalid query');
  };

  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/entries?from=bad&to=2026-03-01' });

  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, 'Invalid query');

  await app.close();
  (pool as any).query = originalQuery;
});

test('GET /api/entries returns entries list', async () => {
  const originalQuery = pool.query;
  (pool as any).query = async () => ({
    rows: [{ id: 1, entry_date: '2026-03-01', reason_codes: ['stress'] }],
    rowCount: 1
  });

  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/entries?from=2026-03-01&to=2026-03-01' });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.entries.length, 1);
  assert.deepEqual(body.entries[0].reason_codes, ['stress']);

  await app.close();
  (pool as any).query = originalQuery;
});
