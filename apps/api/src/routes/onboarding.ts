import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { mapDbError } from '../utils/db-errors.js';
import { calcStreakWithProfile, type StreakEntry, type StreakProfile } from '../utils/streak.js';

const onboardingSchema = z
  .object({
    startMode: z.enum(['now', 'already_sober']),
    soberStartDate: z.string().date().optional(),
    goalDays: z.number().int().min(1).max(3650)
  })
  .superRefine((value, ctx) => {
    if (value.startMode === 'already_sober' && !value.soberStartDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'soberStartDate is required for already_sober' });
    }
  });

export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.post('/onboarding', async (request, reply) => {
    const parsed = onboardingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const userId = request.user.userId;
    const payload = parsed.data;
    let startedAt: string;
    if (payload.startMode === 'already_sober') {
      if (!payload.soberStartDate) {
        return reply.status(400).send({ error: 'soberStartDate is required for already_sober' });
      }
      startedAt = payload.soberStartDate;
    } else {
      startedAt = new Date().toISOString().slice(0, 10);
    }
    const profileForCheck: StreakProfile = {
      started_at: startedAt,
      started_with_existing_streak: payload.startMode === 'already_sober'
    };

    const entriesResult = await pool.query<StreakEntry>(
      `SELECT entry_date::text, drank
       FROM daily_entries
       WHERE user_id = $1 AND entry_date <= CURRENT_DATE
       ORDER BY entry_date DESC`,
      [userId]
    );
    const currentStreak = calcStreakWithProfile(entriesResult.rows, profileForCheck);
    if (payload.goalDays < currentStreak) {
      return reply.status(400).send({
        error: `Goal cannot be less than current streak (${currentStreak})`,
        currentStreak
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const profileResult = await client.query(
        `INSERT INTO user_profiles (user_id, started_at, started_with_existing_streak, current_goal_days)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id)
         DO UPDATE SET
           started_at = EXCLUDED.started_at,
           started_with_existing_streak = EXCLUDED.started_with_existing_streak,
           current_goal_days = EXCLUDED.current_goal_days
         RETURNING *`,
        [userId, startedAt, payload.startMode === 'already_sober', payload.goalDays]
      );

      const activeGoalResult = await client.query(
        `SELECT id
         FROM goals
         WHERE user_id = $1 AND is_active = TRUE
         LIMIT 1`,
        [userId]
      );

      let goal = null;
      if (activeGoalResult.rowCount === 0) {
        const goalResult = await client.query(
          `INSERT INTO goals (user_id, target_days, start_date, is_active)
           VALUES ($1, $2, CURRENT_DATE, TRUE)
           RETURNING id, target_days, start_date, is_active, completed_at, created_at, updated_at`,
          [userId, payload.goalDays]
        );
        goal = goalResult.rows[0];
      } else {
        const activeGoalId = activeGoalResult.rows[0].id;
        const goalResult = await client.query(
          `UPDATE goals
           SET target_days = $2, updated_at = NOW()
           WHERE id = $1
           RETURNING id, target_days, start_date, is_active, completed_at, created_at, updated_at`,
          [activeGoalId, payload.goalDays]
        );
        goal = goalResult.rows[0];
      }

      await client.query('COMMIT');
      return reply.send({ profile: profileResult.rows[0], goal });
    } catch (err) {
      await client.query('ROLLBACK');
      const mapped = mapDbError(err);
      if (mapped) return reply.status(mapped.statusCode).send(mapped.body);
      request.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  app.get('/onboarding', async (request, reply) => {
    const userId = request.user.userId;
    const result = await pool.query(
      `SELECT user_id, started_at, started_with_existing_streak, current_goal_days, created_at, updated_at
       FROM user_profiles
       WHERE user_id = $1`,
      [userId]
    );

    return reply.send({ profile: result.rows[0] ?? null });
  });
};
