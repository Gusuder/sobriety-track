import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { buildGoalProgress } from '../utils/goal-progress.js';
import { calcStreakWithProfile, type StreakEntry, type StreakProfile } from '../utils/streak.js';
import { mapDbError } from '../utils/db-errors.js';

const createGoalSchema = z.object({
  targetDays: z.number().int().min(1).max(3650)
});

export const goalsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.post('/goals', async (request, reply) => {
    const parsed = createGoalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const userId = request.user.userId;
    const payload = parsed.data;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE goals
         SET is_active = FALSE, completed_at = CURRENT_DATE
         WHERE user_id = $1 AND is_active = TRUE`,
        [userId]
      );

      const goalResult = await client.query(
        `INSERT INTO goals (user_id, target_days, start_date, is_active)
         VALUES ($1, $2, CURRENT_DATE, TRUE)
         RETURNING id, user_id, target_days, start_date, is_active, completed_at, created_at, updated_at`,
        [userId, payload.targetDays]
      );

      await client.query('COMMIT');
      return reply.status(201).send({ goal: goalResult.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      const mapped = mapDbError(error);
      if (mapped) return reply.status(mapped.statusCode).send(mapped.body);
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  app.get('/goals', async (request, reply) => {
    const userId = request.user.userId;

    const goalsResult = await pool.query(
      `SELECT id, user_id, target_days, start_date, is_active, completed_at, created_at, updated_at
       FROM goals
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const activeGoal = goalsResult.rows.find((g) => g.is_active);

    const entriesResult = await pool.query<StreakEntry>(
      `SELECT entry_date::text, drank
       FROM daily_entries
       WHERE user_id = $1 AND entry_date <= CURRENT_DATE
       ORDER BY entry_date DESC`,
      [userId]
    );

    const profileResult = await pool.query<StreakProfile>(
      `SELECT started_at::date::text AS started_at, started_with_existing_streak
       FROM user_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    const profile = profileResult.rows[0] ?? null;
    const streakDays = calcStreakWithProfile(entriesResult.rows, profile);

    let progress = null;
    if (activeGoal) {
      progress = buildGoalProgress(Number(activeGoal.target_days), streakDays);
    }

    return reply.send({ goals: goalsResult.rows, activeGoal: activeGoal ?? null, progress });
  });
};


