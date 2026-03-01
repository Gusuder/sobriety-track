import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { mapDbError } from '../utils/db-errors.js';

const createEntrySchema = z.object({
  entryDate: z.string().date(),
  drank: z.boolean(),
  mood: z.enum(['awful', 'bad', 'neutral', 'good', 'great']),
  stressLevel: z.number().int().min(1).max(10),
  cravingLevel: z.number().int().min(1).max(10),
  daySummary: z.string().min(1),
  comment: z.string().optional(),
  reasonCodes: z.array(z.string().min(1)).max(10).optional()
});

export const entriesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/entries/reasons', async (_request, reply) => {
    const result = await pool.query('SELECT code, title FROM drink_reasons ORDER BY id');
    return reply.send({ reasons: result.rows });
  });

  app.post('/entries', async (request, reply) => {
    const parsed = createEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const userId = request.user.userId;
    const p = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const upsertResult = await client.query(
        `INSERT INTO daily_entries (user_id, entry_date, drank, mood, stress_level, craving_level, day_summary, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, entry_date)
         DO UPDATE SET
           drank = EXCLUDED.drank,
           mood = EXCLUDED.mood,
           stress_level = EXCLUDED.stress_level,
           craving_level = EXCLUDED.craving_level,
           day_summary = EXCLUDED.day_summary,
           comment = EXCLUDED.comment,
           updated_at = NOW()
         RETURNING *`,
        [userId, p.entryDate, p.drank, p.mood, p.stressLevel, p.cravingLevel, p.daySummary, p.comment ?? null]
      );

      const entry = upsertResult.rows[0] as { id: number };
      const reasonCodes = [...new Set(p.reasonCodes ?? [])];

      await client.query('DELETE FROM entry_reasons WHERE entry_id = $1', [entry.id]);

      if (reasonCodes.length > 0) {
        await client.query(
          `INSERT INTO entry_reasons (entry_id, reason_id)
           SELECT $1, dr.id
           FROM drink_reasons dr
           WHERE dr.code = ANY($2::text[])
           ON CONFLICT DO NOTHING`,
          [entry.id, reasonCodes]
        );
      }

      await client.query('COMMIT');

      return reply.status(200).send({ entry: upsertResult.rows[0], reasonCodes });
    } catch (error: any) {
      await client.query('ROLLBACK');
      const mapped = mapDbError(error);
      if (mapped) return reply.status(mapped.statusCode).send(mapped.body);
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  app.get('/entries', async (request, reply) => {
    const querySchema = z.object({ from: z.string().date(), to: z.string().date() });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }

    const userId = request.user.userId;
    const { from, to } = parsed.data;

    const result = await pool.query(
      `SELECT de.id,
              de.entry_date,
              de.drank,
              de.mood,
              de.stress_level,
              de.craving_level,
              de.day_summary,
              de.comment,
              de.created_at,
              de.updated_at,
              COALESCE(array_agg(dr.code) FILTER (WHERE dr.code IS NOT NULL), '{}') AS reason_codes
       FROM daily_entries de
       LEFT JOIN entry_reasons er ON er.entry_id = de.id
       LEFT JOIN drink_reasons dr ON dr.id = er.reason_id
       WHERE de.user_id = $1 AND de.entry_date BETWEEN $2 AND $3
       GROUP BY de.id
       ORDER BY de.entry_date DESC`,
      [userId, from, to]
    );

    return reply.send({ entries: result.rows });
  });
};


