import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';

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
    const startedAt = payload.startMode === 'already_sober' ? payload.soberStartDate : new Date().toISOString().slice(0, 10);

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
      }

      await client.query('COMMIT');
      return reply.send({ profile: profileResult.rows[0], goal });
    } catch (err) {
      await client.query('ROLLBACK');
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

