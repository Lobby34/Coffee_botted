'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function createCounterStore(pool, counterFile) {
  let initialization;
  async function migrate() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize initialization across bot instances, including first table creation.
      await client.query('SELECT pg_advisory_xact_lock(670034)');
      await client.query(`CREATE TABLE IF NOT EXISTS message_counters (
        name TEXT PRIMARY KEY,
        count BIGINT NOT NULL CHECK (count >= 0 AND count <= 9007199254740991),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS bot_migrations (
        name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      const applied = await client.query('SELECT name FROM bot_migrations WHERE name = $1', ['message-counters-json-v1']);
      if (!applied.rowCount) {
        const counts = counterFile && fs.existsSync(counterFile)
          ? JSON.parse(fs.readFileSync(counterFile, 'utf8')) : {};
        if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new Error('Invalid message counter file');
        for (const [key, value] of Object.entries(counts)) {
          if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid message counter: ${key}`);
          await client.query('INSERT INTO message_counters (name, count) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [key, value]);
        }
        await client.query('INSERT INTO bot_migrations (name) VALUES ($1)', ['message-counters-json-v1']);
      }
      await client.query("INSERT INTO message_counters (name, count) VALUES ('zuh', 0), ('67', 0) ON CONFLICT (name) DO NOTHING");
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  function initialize() {
    if (!initialization) initialization = migrate().catch(err => { initialization = null; throw err; });
    return initialization;
  }
  return {
    initialize,
    async get(key) {
      await initialize();
      const result = await pool.query('SELECT count FROM message_counters WHERE name = $1', [key]);
      return Number(result.rows[0]?.count || 0);
    },
    async increment(key) {
      await initialize();
      const result = await pool.query(`INSERT INTO message_counters (name, count) VALUES ($1, 1)
        ON CONFLICT (name) DO UPDATE SET count = message_counters.count + 1, updated_at = NOW()
        RETURNING count`, [key]);
      return Number(result.rows[0].count);
    },
    close: () => pool.end(),
  };
}

let store;
function defaultStore() {
  if (!store) {
    const config = require('../config');
    const pool = new Pool({ ...config.database, max: 5, min: 1, keepAlive: true, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    pool.on('error', err => require('../lib/logger').error('Database pool error', { err: err.message }));
    store = createCounterStore(pool, process.env.MESSAGE_COUNTER_FILE || path.resolve(__dirname, '../../data/message-counters.json'));
  }
  return store;
}
module.exports = {
  createCounterStore,
  initialize: () => defaultStore().initialize(),
  get: key => defaultStore().get(key),
  increment: key => defaultStore().increment(key),
  close: () => store ? store.close() : Promise.resolve(),
};
