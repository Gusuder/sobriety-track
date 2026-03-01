import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDbError } from './db-errors.js';

test('maps user FK violations to 401 Unauthorized', () => {
  const mapped = mapDbError({
    code: '23503',
    constraint: 'goals_user_id_fkey'
  });

  assert.deepEqual(mapped, {
    statusCode: 401,
    body: { error: 'Unauthorized' }
  });
});

test('returns null for unknown database errors', () => {
  const mapped = mapDbError({
    code: '22001',
    constraint: 'some_other_constraint'
  });

  assert.equal(mapped, null);
});
