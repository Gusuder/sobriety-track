import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoalProgress } from './goal-progress.js';

test('calculates progress with remaining days for active goal', () => {
  const progress = buildGoalProgress(30, 12);

  assert.deepEqual(progress, {
    targetDays: 30,
    streakDays: 12,
    percent: 40,
    reached: false,
    remainingDays: 18
  });
});

test('caps percent at 100 and remaining at 0 when goal is reached', () => {
  const progress = buildGoalProgress(7, 10);

  assert.deepEqual(progress, {
    targetDays: 7,
    streakDays: 10,
    percent: 100,
    reached: true,
    remainingDays: 0
  });
});
