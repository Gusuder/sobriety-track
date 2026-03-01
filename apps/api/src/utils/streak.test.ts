import test from 'node:test';
import assert from 'node:assert/strict';
import { calcCurrentStreak, type StreakEntry } from './streak.js';

const fixedNow = new Date('2026-03-01T10:00:00.000Z');

function entries(rows: Array<[string, boolean]>): StreakEntry[] {
  return rows.map(([entry_date, drank]) => ({ entry_date, drank }));
}

test('returns 0 when there is no entry for today and yesterday', () => {
  const value = calcCurrentStreak(
    entries([
      ['2026-02-27', false],
      ['2026-02-26', false]
    ]),
    fixedNow
  );

  assert.equal(value, 0);
});

test('counts streak from yesterday when today entry is missing', () => {
  const value = calcCurrentStreak(
    entries([
      ['2026-02-28', false],
      ['2026-02-27', false],
      ['2026-02-26', true]
    ]),
    fixedNow
  );

  assert.equal(value, 2);
});

test('streak is 0 when today entry exists and drank=true', () => {
  const value = calcCurrentStreak(
    entries([
      ['2026-03-01', true],
      ['2026-02-28', false]
    ]),
    fixedNow
  );

  assert.equal(value, 0);
});

test('counts consecutive sober days when today is sober', () => {
  const value = calcCurrentStreak(
    entries([
      ['2026-03-01', false],
      ['2026-02-28', false],
      ['2026-02-27', false],
      ['2026-02-26', true]
    ]),
    fixedNow
  );

  assert.equal(value, 3);
});
