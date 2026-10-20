'use strict';

const fs = require('fs');

async function initializeDadJokes(pool, jokeFile) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(670034)');
    await client.query(`CREATE TABLE IF NOT EXISTS dadjokes (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      joke TEXT NOT NULL CHECK (length(btrim(joke)) > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS bot_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query('SELECT name FROM bot_migrations WHERE name = $1', ['dadjokes-text-v1']);
    if (!applied.rowCount) {
      const jokes = fs.readFileSync(jokeFile, 'utf8').split('\n').map(joke => joke.trim()).filter(Boolean);
      if (!jokes.length) throw new Error('Dad joke import file is empty');
      await client.query('INSERT INTO dadjokes (joke) SELECT unnest($1::text[])', [jokes]);
      await client.query('INSERT INTO bot_migrations (name) VALUES ($1)', ['dadjokes-text-v1']);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initializeDadJokes };
