'use strict';

const { getPool } = require('./database');

function createCounterStore(pool) {
  return {
    async get(key) {
      const result = await pool.query('SELECT count FROM message_counters WHERE name = $1', [key]);
      return Number(result.rows[0]?.count || 0);
    },
    async increment(key) {
      const result = await pool.query(`INSERT INTO message_counters (name, count) VALUES ($1, 1)
        ON CONFLICT (name) DO UPDATE SET count = message_counters.count + 1, updated_at = NOW()
        RETURNING count`, [key]);
      return Number(result.rows[0].count);
    },
  };
}

let store;
function defaultStore() {
  if (!store) store = createCounterStore(getPool());
  return store;
}
module.exports = {
  createCounterStore,
  get: key => defaultStore().get(key),
  increment: key => defaultStore().increment(key),
};
