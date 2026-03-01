export type StreakEntry = {
  entry_date: string;
  drank: boolean;
};

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function minusDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export function calcCurrentStreak(entries: StreakEntry[], now = new Date()): number {
  const byDate = new Map(entries.map((entry) => [entry.entry_date, entry]));
  const todayKey = toDateOnly(now);
  const yesterdayKey = toDateOnly(minusDays(now, 1));

  const hasTodayEntry = byDate.has(todayKey);
  const hasYesterdayEntry = byDate.has(yesterdayKey);

  if (!hasTodayEntry && !hasYesterdayEntry) {
    return 0;
  }

  let streak = 0;
  let cursor = hasTodayEntry ? new Date(now) : minusDays(now, 1);

  while (true) {
    const key = toDateOnly(cursor);
    const entry = byDate.get(key);

    if (!entry || entry.drank) {
      break;
    }

    streak += 1;
    cursor = minusDays(cursor, 1);
  }

  return streak;
}
