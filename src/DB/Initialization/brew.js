'use strict';

const { items } = require('../../lib/brew/catalog');
const { defaults, validateConfig } = require('../../lib/brew/config');

async function initializeBrew(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(670035)');
    await client.query(`CREATE TABLE IF NOT EXISTS brew_config (
      id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      settings JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS brew_items (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('beans','filter','grinder','mug','liquid','extra','coffee')),
      name TEXT NOT NULL,
      emoji TEXT NOT NULL
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS brew_players (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_chat_at TIMESTAMPTZ,
      is_bot BOOLEAN NOT NULL DEFAULT FALSE,
      inventory_version BIGINT NOT NULL DEFAULT 0
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS brew_inventory (
      user_id TEXT NOT NULL REFERENCES brew_players(user_id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK (slot >= 0),
      item_id TEXT NOT NULL REFERENCES brew_items(id),
      rarity SMALLINT NOT NULL CHECK (rarity BETWEEN 0 AND 5),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (user_id, slot)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS brew_events (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id TEXT REFERENCES brew_players(user_id),
      type TEXT NOT NULL,
      details JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS brew_events_user_time_idx ON brew_events (user_id,created_at DESC)');
    await client.query(`CREATE TABLE IF NOT EXISTS brew_crafts (
      user_id TEXT NOT NULL REFERENCES brew_players(user_id),
      request_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      config_version INTEGER NOT NULL,
      recipe JSONB NOT NULL,
      probabilities JSONB NOT NULL,
      result JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, request_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS brew_oauth_states (
      state_hash TEXT PRIMARY KEY,
      intent TEXT NOT NULL DEFAULT 'login',
      admin_user_id TEXT,
      browser_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS brew_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES brew_players(user_id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS brew_sessions_expiry_idx ON brew_sessions (expires_at)');
    for (const item of items) {
      await client.query('INSERT INTO brew_items (id,category,name,emoji) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [item.id,item.category,item.name,item.emoji]);
    }
    await client.query(`CREATE TABLE IF NOT EXISTS brew_chat_activity (
      user_id TEXT PRIMARY KEY, last_chat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS brew_drop_clock (
      id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
      interval_seconds INTEGER NOT NULL,
      next_drop_at TIMESTAMPTZ NOT NULL
    )`);
    await client.query('INSERT INTO brew_config (settings) VALUES ($1::jsonb) ON CONFLICT DO NOTHING', [JSON.stringify(validateConfig(defaults))]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initializeBrew };
