import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './hash.js';

test('hashPassword creates non-plain hash and verifyPassword validates it', async () => {
  const password = 'strongPass123';
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.ok(hash.length > 20);

  const ok = await verifyPassword(password, hash);
  const bad = await verifyPassword('wrong-password', hash);

  assert.equal(ok, true);
  assert.equal(bad, false);
});

