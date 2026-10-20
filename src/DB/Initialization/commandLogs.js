'use strict';

async function initializeCommandLogs(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS command_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    channel TEXT NOT NULL,
    username TEXT NOT NULL,
    user_id TEXT,
    display_name TEXT,
    command TEXT NOT NULL,
    trigger TEXT NOT NULL CHECK (trigger IN ('command', 'automatic', 'observer')),
    message TEXT NOT NULL,
    arguments TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('completed', 'cooldown', 'error')),
    responses JSONB NOT NULL DEFAULT '[]',
    actions JSONB NOT NULL DEFAULT '[]',
    variables JSONB NOT NULL DEFAULT '{}',
    error TEXT
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS command_logs_started_at_idx ON command_logs (started_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS command_logs_command_started_at_idx ON command_logs (command, started_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS command_logs_username_started_at_idx ON command_logs (username, started_at DESC)');
}

module.exports = { initializeCommandLogs };
