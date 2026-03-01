export type StreakEntry = {
  entry_date: string;
  drank: boolean;
};

export type StreakProfile = {
  started_at: string;
  started_with_existing_streak: boolean;
};

function normalizeDateOnly(value: string): string | null {
  const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnlyMatch) {
    return dateOnlyMatch[1];
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function minusDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

function diffDays(fromDateOnly: string, toDateOnlyValue: string): number {
  const from = new Date(`${fromDateOnly}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDateOnlyValue}T00:00:00.000Z`).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((to - from) / oneDay));
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

export function calcStreakWithProfile(entries: StreakEntry[], profile: StreakProfile | null, now = new Date()): number {
  if (!profile?.started_with_existing_streak) {
    return calcCurrentStreak(entries, now);
  }

  const todayKey = toDateOnly(now);
  const normalizedStart = normalizeDateOnly(profile.started_at);
  if (!normalizedStart) {
    return calcCurrentStreak(entries, now);
  }
  let streakStart = normalizedStart;

  for (const entry of entries) {
    if (entry.drank && entry.entry_date >= profile.started_at && entry.entry_date <= todayKey) {
      const nextDay = addDays(entry.entry_date, 1);
      if (nextDay > streakStart) {
        streakStart = nextDay;
      }
    }
  }

  if (streakStart > todayKey) {
    return 0;
  }

  return diffDays(streakStart, todayKey);
}
