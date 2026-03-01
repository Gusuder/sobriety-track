export type GoalProgress = {
  targetDays: number;
  streakDays: number;
  percent: number;
  reached: boolean;
  remainingDays: number;
};

export function buildGoalProgress(targetDays: number, streakDays: number): GoalProgress {
  const safeTarget = Math.max(1, Math.trunc(targetDays));
  const safeStreak = Math.max(0, Math.trunc(streakDays));
  const percent = Math.min(100, Math.round((safeStreak / safeTarget) * 100));
  const reached = safeStreak >= safeTarget;

  return {
    targetDays: safeTarget,
    streakDays: safeStreak,
    percent,
    reached,
    remainingDays: reached ? 0 : safeTarget - safeStreak
  };
}
