$ErrorActionPreference = "Stop"

# Ensure readable UTF-8 output in Windows terminals
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# Always operate from script directory (repo root expected)
Set-Location -Path $PSScriptRoot

function Write-Step($msg) {
  Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

function Write-FileUtf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $enc = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot $Path), $Content, $enc)
}

Write-Step "Checking current folder"
if (-not (Test-Path ".git")) {
  throw "Run the script from the repository root (where .git exists)."
}

Write-Step "Creating project structure"
New-Item -ItemType Directory -Force -Path "apps/api/src/config" | Out-Null
New-Item -ItemType Directory -Force -Path "apps/api/src/db" | Out-Null
New-Item -ItemType Directory -Force -Path "apps/api/src/routes" | Out-Null
New-Item -ItemType Directory -Force -Path "apps/api/src/types" | Out-Null
New-Item -ItemType Directory -Force -Path "apps/api/src/utils" | Out-Null
New-Item -ItemType Directory -Force -Path "docs" | Out-Null
New-Item -ItemType Directory -Force -Path "apps/web" | Out-Null
New-Item -ItemType Directory -Force -Path "scripts" | Out-Null
New-Item -ItemType Directory -Force -Path ".github/workflows" | Out-Null

Write-Step "Writing backend MVP files"
@'
node_modules/
apps/api/dist/
.env
.DS_Store
'@ | Set-Content -Path ".gitignore" -Encoding UTF8

@'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: sobriety_track
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d sobriety_track"]
      interval: 5s
      timeout: 5s
      retries: 10

  web:
    image: nginx:alpine
    volumes:
      - ./apps/web:/usr/share/nginx/html:ro
    ports:
      - "8080:80"

  api:
    build:
      context: ./apps/api
    environment:
      PORT: 4000
      JWT_SECRET: change-me-super-secret
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/sobriety_track
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
'@ | Set-Content -Path "docker-compose.yml" -Encoding UTF8

@'
.PHONY: up down reset logs smoke

up:
	docker compose up --build

down:
	docker compose down

reset:
	docker compose down -v

logs:
	docker compose logs -f api postgres

smoke:
	powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1
'@ | Set-Content -Path "Makefile" -Encoding UTF8

@'
name: CI

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  api-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/api
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: apps/api/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

  smoke-e2e:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build and start services
        run: docker compose up --build -d

      - name: Run smoke E2E
        shell: pwsh
        run: ./scripts/smoke-e2e.ps1

      - name: Dump compose status
        if: always()
        run: docker compose ps

      - name: Dump API logs on failure
        if: failure()
        run: docker compose logs api

      - name: Stop services
        if: always()
        run: docker compose down -v
'@ | Set-Content -Path ".github/workflows/ci.yml" -Encoding UTF8

@'
# Sobriety Track

MVP now includes:
- Backend API (Fastify + PostgreSQL)
- Minimal Web UI for manual testing

## Run
docker compose up --build

## Local MVP Verification
1. Copy API environment variables: cp apps/api/.env.example apps/api/.env
2. Start the project: docker compose up --build
3. Wait for services and check health endpoint: curl http://localhost:4000/health
   Expected response: {"status":"ok"}.
4. Open UI for manual checks: http://localhost:8080
5. Complete base scenario in UI:
   - Register
   - Login
   - Save/Get onboarding
   - Create/Load goals
   - Create entry and List entries
6. Stop environment after checks: docker compose down -v

## URLs
- Web UI: http://localhost:8080
- API health: http://localhost:4000/health

## Smoke E2E
Run after docker compose up --build:
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-e2e.ps1

## API endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/forgot-password (returns reset token in MVP dev mode)
- POST /api/auth/reset-password
- GET /api/entries/reasons
- POST /api/entries
- GET /api/entries?from=YYYY-MM-DD&to=YYYY-MM-DD
- POST /api/onboarding
- GET /api/onboarding
- POST /api/goals
- GET /api/goals

## What to test in Web UI
1. Register
2. Login (token saved in localStorage)
3. Save/Get onboarding
4. Create goal and load progress
5. Create daily entry
6. List entries by period

'@ | Set-Content -Path "README.md" -Encoding UTF8

@'
PORT=4000
JWT_SECRET=change-me
DATABASE_URL=postgres://postgres:postgres@postgres:5432/sobriety_track
'@ | Set-Content -Path "apps/api/.env.example" -Encoding UTF8

Write-FileUtf8NoBom -Path "apps/api/package.json" -Content @'
{
  "name": "sobriety-track-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test src/**/*.test.ts"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.5",
    "fastify": "^4.28.1",
    "@fastify/cors": "^9.0.1",
    "@fastify/jwt": "^8.0.1",
    "pg": "^8.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.10.2",
    "@types/pg": "^8.11.10",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
'@

@'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
'@ | Set-Content -Path "apps/api/tsconfig.json" -Encoding UTF8

@'
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/package.json /app/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=base /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/server.js"]
'@ | Set-Content -Path "apps/api/Dockerfile" -Encoding UTF8

@'
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(8),
  DATABASE_URL: z.string().min(1)
});

export const env = envSchema.parse(process.env);
'@ | Set-Content -Path "apps/api/src/config/env.ts" -Encoding UTF8

@'
import { Pool } from 'pg';
import { env } from '../config/env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });
'@ | Set-Content -Path "apps/api/src/db/pool.ts" -Encoding UTF8

@'
import { pool } from './pool.js';

const ddl = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  login VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mood_level') THEN
    CREATE TYPE mood_level AS ENUM ('awful','bad','neutral','good','great');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS daily_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  drank BOOLEAN NOT NULL,
  mood mood_level NOT NULL,
  stress_level SMALLINT NOT NULL CHECK (stress_level BETWEEN 1 AND 10),
  craving_level SMALLINT NOT NULL CHECK (craving_level BETWEEN 1 AND 10),
  day_summary TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  started_with_existing_streak BOOLEAN NOT NULL DEFAULT FALSE,
  current_goal_days INTEGER NOT NULL DEFAULT 7 CHECK (current_goal_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_days INTEGER NOT NULL CHECK (target_days BETWEEN 1 AND 3650),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_goals_one_active_per_user
ON goals (user_id)
WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drink_reasons (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entry_reasons (
  entry_id INTEGER NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
  reason_id INTEGER NOT NULL REFERENCES drink_reasons(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, reason_id)
);

INSERT INTO drink_reasons (code, title)
VALUES
  ('stress', 'Stress'),
  ('conflict', 'Conflict'),
  ('loneliness', 'Loneliness'),
  ('social', 'Social situation'),
  ('celebration', 'Celebration'),
  ('habit', 'Habit'),
  ('boredom', 'Boredom'),
  ('insomnia', 'Insomnia'),
  ('other', 'Other')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION touch_daily_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_entries_updated_at ON daily_entries;
CREATE TRIGGER trg_daily_entries_updated_at
BEFORE UPDATE ON daily_entries
FOR EACH ROW EXECUTE FUNCTION touch_daily_entries_updated_at();

CREATE OR REPLACE FUNCTION touch_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION touch_user_profiles_updated_at();

CREATE OR REPLACE FUNCTION touch_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_goals_updated_at ON goals;
CREATE TRIGGER trg_goals_updated_at
BEFORE UPDATE ON goals
FOR EACH ROW EXECUTE FUNCTION touch_goals_updated_at();
`;

export async function runMigrations() {
  await pool.query(ddl);
}

'@ | Set-Content -Path "apps/api/src/db/migrate.ts" -Encoding UTF8

@'
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
'@ | Set-Content -Path "apps/api/src/utils/hash.ts" -Encoding UTF8

@'
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';

const registerSchema = z.object({
  login: z.string().min(3).max(100),
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(8)
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(12),
  newPassword: z.string().min(8)
});

const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { login, email, password } = parsed.data;
    const passwordHash = await hashPassword(password);

    try {
      const result = await pool.query(
        `INSERT INTO users (login, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, login, email, created_at`,
        [login, email, passwordHash]
      );

      return reply.status(201).send({ user: result.rows[0] });
    } catch (error: any) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: 'Login or email already exists' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { login, password } = parsed.data;

    const result = await pool.query('SELECT id, login, password_hash FROM users WHERE login = $1', [login]);
    const user = result.rows[0];

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ userId: user.id, login: user.login });
    return reply.send({ accessToken: token });
  });

  app.post('/auth/forgot-password', async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { email } = parsed.data;
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0] as { id: number } | undefined;

    if (!user) {
      return reply.send({ ok: true, message: 'If email exists, reset instructions were sent.' });
    }

    const resetToken = randomBytes(24).toString('hex');
    const tokenHash = hashResetToken(resetToken);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [user.id, tokenHash]
    );

    return reply.send({
      ok: true,
      message: 'Reset token created (MVP dev mode).',
      resetToken
    });
  });

  app.post('/auth/reset-password', async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { token, newPassword } = parsed.data;
    const tokenHash = hashResetToken(token);

    const tokenResult = await pool.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       ORDER BY id DESC
       LIMIT 1`,
      [tokenHash]
    );

    const resetRow = tokenResult.rows[0] as { id: number; user_id: number } | undefined;
    if (!resetRow) {
      return reply.status(400).send({ error: 'Invalid or expired reset token' });
    }

    const newPasswordHash = await hashPassword(newPassword);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, resetRow.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [resetRow.id]);

    return reply.send({ ok: true, message: 'Password updated successfully' });
  });
};

'@ | Set-Content -Path "apps/api/src/routes/auth.ts" -Encoding UTF8

@'
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';

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

      const insertResult = await client.query(
        `INSERT INTO daily_entries (user_id, entry_date, drank, mood, stress_level, craving_level, day_summary, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [userId, p.entryDate, p.drank, p.mood, p.stressLevel, p.cravingLevel, p.daySummary, p.comment ?? null]
      );

      const entry = insertResult.rows[0] as { id: number };
      const reasonCodes = [...new Set(p.reasonCodes ?? [])];

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

      return reply.status(201).send({ entry: insertResult.rows[0], reasonCodes });
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return reply.status(409).send({ error: 'Entry for this date already exists' });
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

'@ | Set-Content -Path "apps/api/src/routes/entries.ts" -Encoding UTF8

@'
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
'@ | Set-Content -Path "apps/api/src/utils/streak.ts" -Encoding UTF8

@'
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
'@ | Set-Content -Path "apps/api/src/utils/goal-progress.ts" -Encoding UTF8

@'
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { buildGoalProgress } from '../utils/goal-progress.js';
import { calcCurrentStreak, type StreakEntry } from '../utils/streak.js';

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

    const streakDays = calcCurrentStreak(entriesResult.rows);

    let progress = null;
    if (activeGoal) {
      progress = buildGoalProgress(Number(activeGoal.target_days), streakDays);
    }

    return reply.send({ goals: goalsResult.rows, activeGoal: activeGoal ?? null, progress });
  });
};
'@ | Set-Content -Path "apps/api/src/routes/goals.ts" -Encoding UTF8

@'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { authRoutes } from './routes/auth.js';
import { entriesRoutes } from './routes/entries.js';
import { goalsRoutes } from './routes/goals.js';
import { onboardingRoutes } from './routes/onboarding.js';

const app = Fastify({ logger: true });

app.register(cors, { origin: true });
app.register(fastifyJwt, { secret: env.JWT_SECRET });

app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
});

app.get('/health', async () => ({ status: 'ok' }));
app.register(authRoutes, { prefix: '/api' });
app.register(entriesRoutes, { prefix: '/api' });
app.register(goalsRoutes, { prefix: '/api' });
app.register(onboardingRoutes, { prefix: '/api' });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForDatabase = async (maxAttempts = 15) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runMigrations();
      app.log.info({ attempt }, 'Database is ready');
      return;
    } catch (err) {
      app.log.warn({ attempt, err }, 'Database is not ready yet, retrying...');
      if (attempt === maxAttempts) {
        throw err;
      }
      await sleep(2000);
    }
  }
};

const start = async () => {
  await waitForDatabase();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
};

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});

'@ | Set-Content -Path "apps/api/src/server.ts" -Encoding UTF8

@'
import '@fastify/jwt';
import 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: number;
      login: string;
    };
    user: {
      userId: number;
      login: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}
'@ | Set-Content -Path "apps/api/src/types/fastify.d.ts" -Encoding UTF8


@'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sobriety Track</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; background:#f6f3ed; margin:0; color:#2d2a26; }
      .wrap { max-width: 860px; margin: 24px auto; padding: 0 16px; }
      .card { background:#fff; border-radius:16px; padding:16px; margin-bottom:14px; box-shadow:0 6px 18px rgba(0,0,0,.08); }
      h1 { margin:0 0 10px; font-size: 30px; }
      h3 { margin: 0 0 8px; }
      input, select, textarea, button { width:100%; padding:10px; margin-top:8px; border-radius:10px; border:1px solid #d8d3c7; box-sizing:border-box; }
      button { background:#6f8b74; color:#fff; border:none; cursor:pointer; font-weight:600; }
      button:hover { opacity:.95; }
      .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
      .muted { color:#6f6a63; font-size:14px; margin-top:0; }
      pre { background:#1e1e1e; color:#d8ffd8; padding:10px; border-radius:10px; overflow:auto; font-size:12px; min-height:120px; }
      .pill { display:inline-block; background:#ece7dc; color:#5f584e; border-radius:999px; padding:6px 10px; font-size:12px; margin-right:6px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Sobriety Track (MVP)</h1>
      <p class="muted">Extended web UI for testing auth, onboarding, goals/progress, password reset, reasons and entries.</p>

      <div class="card">
        <h3>0) Health</h3>
        <button onclick="healthCheck()">Check API health</button>
      </div>

      <div class="card">
        <h3>1) Registration</h3>
        <input id="regLogin" placeholder="login" value="demo_user" />
        <input id="regEmail" placeholder="email" value="demo@example.com" />
        <input id="regPassword" type="password" placeholder="password" value="strongPass123" />
        <button onclick="registerUser()">Register</button>
      </div>

      <div class="card">
        <h3>2) Login</h3>
        <input id="login" placeholder="login" value="demo_user" />
        <input id="password" type="password" placeholder="password" value="strongPass123" />
        <button onclick="loginUser()">Login</button>
      </div>

      <div class="card">
        <h3>3) Forgot / Reset password</h3>
        <input id="forgotEmail" placeholder="email" value="demo@example.com" />
        <button onclick="forgotPassword()">Create reset token (dev mode)</button>
        <div class="row">
          <input id="resetToken" placeholder="reset token" />
          <input id="newPassword" type="password" placeholder="new password" value="newStrongPass456" />
        </div>
        <button onclick="resetPassword()">Reset password</button>
      </div>

      <div class="card">
        <h3>4) Onboarding</h3>
        <div class="row3">
          <select id="startMode" onchange="toggleSoberDate()">
            <option value="now">start now</option>
            <option value="already_sober">already sober</option>
          </select>
          <input id="soberStartDate" type="date" disabled />
          <input id="goalDays" type="number" min="1" max="3650" value="30" />
        </div>
        <div style="margin-top:10px">
          <button onclick="saveOnboarding()">Save onboarding</button>
          <button onclick="getOnboarding()" style="margin-top:8px">Get onboarding</button>
        </div>
      </div>

      <div class="card">
        <h3>5) Goals / Streak</h3>
        <p class="muted">РџРѕСЃР»Рµ Р»РѕРіРёРЅР° РЅР°Р¶РјРёС‚Рµ <b>Load goals/progress</b>. Р•СЃР»Рё С†РµР»РµР№ РµС‰С‘ РЅРµС‚, СЃРЅР°С‡Р°Р»Р° СЃРѕР·РґР°Р№С‚Рµ Goal.</p>
        <div class="row">
          <input id="targetDays" type="number" min="1" max="3650" value="30" placeholder="target days" />
          <input id="streakView" type="text" value="streak: unknown" readonly />
        </div>
        <button onclick="createGoal()">Create goal</button>
        <button onclick="loadGoals()" style="margin-top:8px">Load goals/progress</button>
      </div>

      <div class="card">
        <h3>6) Reasons</h3>
        <button onclick="loadReasons()">Load drink reasons</button>
        <div id="reasonsPills" style="margin-top:10px"></div>
      </div>

      <div class="card">
        <h3>7) Daily entry</h3>
        <div class="row">
          <input id="entryDate" type="date" />
          <select id="mood">
            <option value="awful">awful</option>
            <option value="bad">bad</option>
            <option value="neutral">neutral</option>
            <option value="good" selected>good</option>
            <option value="great">great</option>
          </select>
        </div>
        <div class="row">
          <input id="stress" type="number" min="1" max="10" value="3" placeholder="stress 1-10" />
          <input id="craving" type="number" min="1" max="10" value="4" placeholder="craving 1-10" />
        </div>
        <select id="drank">
          <option value="false" selected>Did not drink</option>
          <option value="true">Drank</option>
        </select>
        <textarea id="summary" placeholder="How was your day">Calm day without alcohol</textarea>
        <input id="comment" placeholder="Comment" value="All good" />
        <input id="reasonCodes" placeholder="reason codes csv, e.g. stress,boredom" value="stress,boredom" />
        <button onclick="createEntry()">Save entry</button>
      </div>

      <div class="card">
        <h3>8) Get entries</h3>
        <div class="row">
          <input id="from" type="date" />
          <input id="to" type="date" />
        </div>
        <button onclick="listEntries()">Show entries</button>
      </div>

      <div class="card">
        <h3>API response</h3>
        <pre id="out">Ready...</pre>
      </div>
    </div>

    <script>
      const API_BASE = 'http://localhost:4000';
      const API = `${API_BASE}/api`;
      let token = localStorage.getItem('token') || '';
      const out = document.getElementById('out');
      const today = new Date().toISOString().slice(0,10);
      document.getElementById('entryDate').value = today;
      document.getElementById('from').value = today.slice(0,8) + '01';
      document.getElementById('to').value = today;
      document.getElementById('soberStartDate').value = today;

      if (token) {
        loadGoals();
      }

      const print = (data) => out.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

      async function req(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(API + path, { ...options, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw data;
        return data;
      }

      async function healthCheck() {
        try {
          const res = await fetch(`${API_BASE}/health`);
          const data = await res.json();
          print(data);
        } catch (e) { print(e); }
      }

      async function registerUser() {
        try {
          const payload = {
            login: regLogin.value,
            email: regEmail.value,
            password: regPassword.value
          };
          print(await req('/auth/register', { method:'POST', body: JSON.stringify(payload) }));
        } catch (e) { print(e); }
      }

      async function loginUser() {
        try {
          const payload = { login: login.value, password: password.value };
          const data = await req('/auth/login', { method:'POST', body: JSON.stringify(payload) });
          token = data.accessToken;
          localStorage.setItem('token', token);
          print({ ok: true, token });
          await loadGoals();
        } catch (e) { print(e); }
      }

      async function forgotPassword() {
        try {
          const payload = { email: forgotEmail.value };
          const data = await req('/auth/forgot-password', { method:'POST', body: JSON.stringify(payload) });
          if (data.resetToken) {
            resetToken.value = data.resetToken;
          }
          print(data);
        } catch (e) { print(e); }
      }

      async function resetPassword() {
        try {
          const payload = { token: resetToken.value, newPassword: newPassword.value };
          print(await req('/auth/reset-password', { method:'POST', body: JSON.stringify(payload) }));
        } catch (e) { print(e); }
      }

      function toggleSoberDate() {
        soberStartDate.disabled = startMode.value !== 'already_sober';
      }

      async function saveOnboarding() {
        try {
          const payload = {
            startMode: startMode.value,
            goalDays: Number(goalDays.value)
          };
          if (startMode.value === 'already_sober') {
            payload.soberStartDate = soberStartDate.value;
          }
          const data = await req('/onboarding', { method:'POST', body: JSON.stringify(payload) });
          print(data);
          await loadGoals();
        } catch (e) { print(e); }
      }

      async function getOnboarding() {
        try {
          print(await req('/onboarding'));
        } catch (e) { print(e); }
      }

      async function createGoal() {
        try {
          const rawTarget = Number(targetDays.value);
          if (!Number.isFinite(rawTarget) || rawTarget < 1) {
            throw new Error('targetDays must be a positive number');
          }

          const payload = { targetDays: rawTarget };
          print(await req('/goals', { method:'POST', body: JSON.stringify(payload) }));
          await loadGoals();
        } catch (e) { print(e); }
      }

      async function loadGoals() {
        try {
          const data = await req('/goals');
          const progress = data?.progress;

          if (!data?.activeGoal) {
            streakView.value = 'no active goal yet';
          } else if (!progress) {
            streakView.value = `goal: ${data.activeGoal.target_days}d | streak: 0d`;
          } else {
            const streak = progress.streakDays ?? 0;
            const target = progress.targetDays ?? data.activeGoal.target_days ?? '-';
            const percent = progress.percent ?? 0;
            const remaining = progress.remainingDays ?? Math.max(0, Number(target) - streak);
            streakView.value = `streak: ${streak}d | target: ${target}d | ${percent}% | left: ${remaining}d`;
          }

          print(data);
        } catch (e) {
          if (e?.error === 'Unauthorized') {
            streakView.value = 'login required';
          }
          print(e);
        }
      }

      async function loadReasons() {
        try {
          const data = await req('/entries/reasons');
          reasonsPills.innerHTML = (data.reasons || []).map((r) => `<span class="pill">${r.code}: ${r.title}</span>`).join('');
          print(data);
        } catch (e) { print(e); }
      }

      async function createEntry() {
        try {
          const reasonCodes = reasonCodesInput();
          const payload = {
            entryDate: entryDate.value,
            drank: drank.value === 'true',
            mood: mood.value,
            stressLevel: Number(stress.value),
            cravingLevel: Number(craving.value),
            daySummary: summary.value,
            comment: comment.value,
            reasonCodes
          };
          print(await req('/entries', { method:'POST', body: JSON.stringify(payload) }));
        } catch (e) { print(e); }
      }

      function reasonCodesInput() {
        return reasonCodes.value
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
      }

      async function listEntries() {
        try {
          print(await req(`/entries?from=${from.value}&to=${to.value}`));
        } catch (e) { print(e); }
      }
    </script>
  </body>
</html>

'@ | Set-Content -Path "apps/web/index.html" -Encoding UTF8

@'
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

'@ | Set-Content -Path "apps/api/src/routes/onboarding.ts" -Encoding UTF8

@'
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './hash.js';

test('hashPassword creates non-plain hash and verifyPassword validates it', async () => {
  const password = 'strongPass123';
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.ok(hash.length > 20);

  const ok = await verifyPassword(password, hash);
  const bad = await verifyPassword('wrong-password', hash);

  assert.equal(ok, true);
  assert.equal(bad, false);
});

'@ | Set-Content -Path "apps/api/src/utils/hash.test.ts" -Encoding UTF8

@'
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

'@ | Set-Content -Path "apps/api/src/utils/goal-progress.test.ts" -Encoding UTF8

@'
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

'@ | Set-Content -Path "apps/api/src/utils/streak.test.ts" -Encoding UTF8

@'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('migration includes required phase-1 tables', async () => {
  const current = fileURLToPath(import.meta.url);
  const file = path.join(path.dirname(current), 'migrate.ts');
  const src = await readFile(file, 'utf8');

  assert.match(src, /CREATE TABLE IF NOT EXISTS users/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS daily_entries/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS user_profiles/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS goals/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS password_reset_tokens/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS drink_reasons/i);
  assert.match(src, /CREATE TABLE IF NOT EXISTS entry_reasons/i);
});

'@ | Set-Content -Path "apps/api/src/db/migrate.test.ts" -Encoding UTF8

@'
param(
  [string]$ApiBase = "http://localhost:4000",
  [string]$WebBase = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

$api = "$ApiBase/api"
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$login = "smoke_$stamp"
$email = "$login@example.com"
$password = "StrongPass123!"
$today = (Get-Date).ToString("yyyy-MM-dd")
$from = (Get-Date -Day 1).ToString("yyyy-MM-dd")

function Step($text) {
  Write-Host "== $text" -ForegroundColor Cyan
}

Step "Health"
$health = Invoke-RestMethod -Method GET -Uri "$ApiBase/health"
if ($health.status -ne "ok") {
  throw "Health check failed"
}

Step "Auth register/login"
$registerBody = @{ login = $login; email = $email; password = $password } | ConvertTo-Json
[void](Invoke-RestMethod -Method POST -Uri "$api/auth/register" -ContentType "application/json" -Body $registerBody)

$loginBody = @{ login = $login; password = $password } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Method POST -Uri "$api/auth/login" -ContentType "application/json" -Body $loginBody
$token = $loginRes.accessToken
if (-not $token) {
  throw "Login failed: no access token"
}
$headers = @{ Authorization = "Bearer $token" }

Step "Onboarding"
$onboardingBody = @{ startMode = "now"; goalDays = 30 } | ConvertTo-Json
$onboardingSave = Invoke-RestMethod -Method POST -Uri "$api/onboarding" -Headers $headers -ContentType "application/json" -Body $onboardingBody
if (-not $onboardingSave.profile) {
  throw "Onboarding save failed"
}
[void](Invoke-RestMethod -Method GET -Uri "$api/onboarding" -Headers $headers)

Step "Goals/progress"
$goals = Invoke-RestMethod -Method GET -Uri "$api/goals" -Headers $headers
if (-not $goals.activeGoal) {
  throw "Expected active goal after onboarding"
}

$newGoalBody = @{ targetDays = 45 } | ConvertTo-Json
$newGoal = Invoke-RestMethod -Method POST -Uri "$api/goals" -Headers $headers -ContentType "application/json" -Body $newGoalBody
if ($newGoal.goal.target_days -ne 45) {
  throw "Goal create failed"
}

$goalsAfter = Invoke-RestMethod -Method GET -Uri "$api/goals" -Headers $headers
if (-not $goalsAfter.progress) {
  throw "Goal progress was not returned"
}

Step "Reasons + entries"
$reasons = Invoke-RestMethod -Method GET -Uri "$api/entries/reasons" -Headers $headers
if (@($reasons.reasons).Count -lt 1) {
  throw "Reasons list is empty"
}

$entryBody = @{
  entryDate = $today
  drank = $false
  mood = "good"
  stressLevel = 3
  cravingLevel = 4
  daySummary = "Smoke E2E entry"
  comment = "ok"
  reasonCodes = @("stress", "boredom")
} | ConvertTo-Json

[void](Invoke-RestMethod -Method POST -Uri "$api/entries" -Headers $headers -ContentType "application/json" -Body $entryBody)
$entries = Invoke-RestMethod -Method GET -Uri "$api/entries?from=$from&to=$today" -Headers $headers
if (@($entries.entries).Count -lt 1) {
  throw "Entries list is empty"
}

Step "Web smoke"
$html = (Invoke-WebRequest -UseBasicParsing -Uri $WebBase).Content
if ($html -notlike "*5) Goals / Streak*") {
  throw "Web UI does not contain goals block"
}
if ($html -notlike "*loadGoals()*") {
  throw "Web UI does not contain loadGoals() call"
}

Step "Done"
Write-Host "Smoke E2E passed" -ForegroundColor Green
'@ | Set-Content -Path "scripts/smoke-e2e.ps1" -Encoding UTF8

Write-Step "Verifying generated files"
$composePath = Join-Path $PSScriptRoot "docker-compose.yml"
if (-not (Test-Path $composePath)) {
  throw "docker-compose.yml was not found at: $composePath"
}
Write-Host "docker-compose.yml created: $composePath" -ForegroundColor Green

Write-Step "Done"
Write-Host "Files created/updated. Now run:" -ForegroundColor Green
Write-Host "  docker compose -f .\docker-compose.yml up --build" -ForegroundColor Yellow
Write-Host "Then check: http://localhost:4000/health" -ForegroundColor Yellow
