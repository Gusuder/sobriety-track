import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { profileRoutes } from './profile.js';
import { pool } from '../db/pool.js';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request) => {
    request.user = { userId: 1, login: 'demo' };
  });
  app.register(profileRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

test('GET /api/profile returns profile stats and achievements', async () => {
  const originalQuery = pool.query;
  let calls = 0;

  (pool as any).query = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        rows: [{ id: 1, login: 'demo', email: 'demo@example.com', display_name: 'Демо', created_at: '2026-01-01T00:00:00.000Z' }],
        rowCount: 1
      };
    }
    if (calls === 2) {
      return {
        rows: [{ started_at: '2026-02-20', started_with_existing_streak: true }],
        rowCount: 1
      };
    }
    if (calls === 3) {
      return {
        rows: [
          { entry_date: '2026-02-27', drank: false },
          { entry_date: '2026-02-28', drank: false },
          { entry_date: '2026-03-01', drank: false }
        ],
        rowCount: 3
      };
    }
    return { rows: [{ target_days: 5 }], rowCount: 1 };
  };

  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/profile' });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.profile.displayName, 'Демо');
  assert.equal(body.profile.totalEntries, 3);
  assert.equal(body.profile.drankDays, 0);
  assert.equal(Array.isArray(body.achievements), true);
  assert.equal(body.achievements.some((a: any) => a.code === 'first_checkin'), true);

  await app.close();
  (pool as any).query = originalQuery;
});

