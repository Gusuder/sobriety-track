import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { calcStreakWithProfile, type StreakEntry, type StreakProfile } from '../utils/streak.js';

type Achievement = {
  code: string;
  title: string;
  description: string;
  unlocked: boolean;
};

function calcLongestSoberRun(entries: StreakEntry[]): number {
  if (!entries.length) return 0;
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  let maxRun = 0;
  let run = 0;
  let prevDate: string | null = null;

  for (const entry of sorted) {
    if (entry.drank) {
      run = 0;
      prevDate = entry.entry_date;
      continue;
    }

    if (!prevDate) {
      run = 1;
    } else {
      const prev = new Date(`${prevDate}T00:00:00.000Z`);
      prev.setUTCDate(prev.getUTCDate() + 1);
      const expected = prev.toISOString().slice(0, 10);
      run = expected === entry.entry_date ? run + 1 : 1;
    }

    if (run > maxRun) maxRun = run;
    prevDate = entry.entry_date;
  }

  return maxRun;
}

function buildAchievements(stats: {
  totalEntries: number;
  soberDays: number;
  currentStreak: number;
  maxStreak: number;
  activeGoalReached: boolean;
}): Achievement[] {
  return [
    {
      code: 'first_checkin',
      title: 'Первый шаг',
      description: 'Сделать первую запись в дневнике',
      unlocked: stats.totalEntries >= 1
    },
    {
      code: 'streak_3',
      title: '3 дня подряд',
      description: 'Держать трезвую серию минимум 3 дня',
      unlocked: stats.maxStreak >= 3
    },
    {
      code: 'streak_7',
      title: 'Неделя трезвости',
      description: 'Держать трезвую серию минимум 7 дней',
      unlocked: stats.maxStreak >= 7
    },
    {
      code: 'streak_30',
      title: 'Месяц трезвости',
      description: 'Держать трезвую серию минимум 30 дней',
      unlocked: stats.maxStreak >= 30
    },
    {
      code: 'entries_10',
      title: 'Ритм отмечаний',
      description: 'Сделать 10 ежедневных отметок',
      unlocked: stats.totalEntries >= 10
    },
    {
      code: 'goal_reached',
      title: 'Цель закрыта',
      description: 'Достигнуть активной цели по дням',
      unlocked: stats.activeGoalReached
    }
  ];
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/profile', async (request, reply) => {
    const userId = request.user.userId;

    const [userResult, profileResult, entriesResult, activeGoalResult] = await Promise.all([
      pool.query<{ id: number; login: string; email: string; display_name: string | null; created_at: string }>(
        `SELECT id, login, email, display_name, created_at
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      ),
      pool.query<StreakProfile>(
        `SELECT started_at::text, started_with_existing_streak
         FROM user_profiles
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      ),
      pool.query<StreakEntry>(
        `SELECT entry_date::text, drank
         FROM daily_entries
         WHERE user_id = $1 AND entry_date <= CURRENT_DATE
         ORDER BY entry_date ASC`,
        [userId]
      ),
      pool.query<{ target_days: number }>(
        `SELECT target_days
         FROM goals
         WHERE user_id = $1 AND is_active = TRUE
         LIMIT 1`,
        [userId]
      )
    ]);

    const user = userResult.rows[0];
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const profile = profileResult.rows[0] ?? null;
    const entries = entriesResult.rows;
    const activeGoal = activeGoalResult.rows[0] ?? null;

    const currentStreak = calcStreakWithProfile(entries, profile);
    const soberDays = entries.filter((e) => !e.drank).length;
    const drankDays = entries.filter((e) => e.drank).length;
    const maxByEntries = calcLongestSoberRun(entries);
    const maxStreak = Math.max(maxByEntries, currentStreak);
    const activeGoalReached = Boolean(activeGoal && currentStreak >= Number(activeGoal.target_days));

    const achievements = buildAchievements({
      totalEntries: entries.length,
      soberDays,
      currentStreak,
      maxStreak,
      activeGoalReached
    });

    return reply.send({
      profile: {
        login: user.login,
        email: user.email,
        displayName: user.display_name ?? user.login,
        createdAt: user.created_at,
        startedAt: profile?.started_at ?? null,
        startedWithExistingStreak: profile?.started_with_existing_streak ?? false,
        currentStreak,
        maxStreak,
        totalEntries: entries.length,
        soberDays,
        drankDays,
        activeGoalDays: activeGoal ? Number(activeGoal.target_days) : null
      },
      achievements
    });
  });
};

