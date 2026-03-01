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

