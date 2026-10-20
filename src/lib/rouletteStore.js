'use strict';

const { getPool } = require('./database');

function createRouletteStore(pool) {
  return {
    async increment(username) {
      const result = await pool.query(`INSERT INTO rr_deaths (username, count) VALUES ($1, 1)
        ON CONFLICT (username) DO UPDATE SET count = rr_deaths.count + 1, updated_at = NOW()
        RETURNING count`, [username.toLowerCase()]);
      return Number(result.rows[0].count);
    },
    async leaderboard() {
      const result = await pool.query('SELECT username, count FROM rr_deaths ORDER BY count DESC, username ASC LIMIT 5');
      return result.rows.map(row => ({ username: row.username, count: Number(row.count) }));
    },
  };
}

module.exports = {
  createRouletteStore,
  increment: username => createRouletteStore(getPool()).increment(username),
  leaderboard: () => createRouletteStore(getPool()).leaderboard(),
};
