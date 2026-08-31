-- P14.5 / 001
-- Code-defined schema copied from server/db/postgres.ts SCHEMA_SQL (P12–P14.4).
-- No new tables, foreign keys, unique constraints, or indexes.
-- IF NOT EXISTS matches the previous runtime bootstrap so existing databases are unchanged.

CREATE TABLE IF NOT EXISTS guard_decisions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  action TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  summary TEXT,
  sim_swap_recent BOOLEAN,
  sim_swap_hours_ago DOUBLE PRECISION,
  location_result TEXT,
  location_match BOOLEAN,
  location_match_rate INTEGER,
  number_verified BOOLEAN,
  nac_mode TEXT,
  frozen_at TIMESTAMPTZ,
  traces JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS guard_decisions_email_created_idx
  ON guard_decisions (email, created_at DESC);

CREATE INDEX IF NOT EXISTS guard_decisions_decision_created_idx
  ON guard_decisions (decision, created_at DESC);

CREATE TABLE IF NOT EXISTS merchants (
  email TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  email TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS track_events (
  id TEXT PRIMARY KEY,
  at BIGINT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS track_events_at_idx ON track_events (at DESC);
