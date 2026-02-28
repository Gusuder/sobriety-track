import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('migration includes required phase-1 tables', async () => {
  const current = fileURLToPath(import.meta.url);
  const file = path.join(path.dirname(current), 'migrate.ts');
  const src = await readFile(file, 'utf8');

  assert.match(src, /CREATE TABLE IF NOT EXISTS users/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS daily_entries/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS user_profiles/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS password_reset_tokens/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS drink_reasons/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS entry_reasons/i);
});

