'use strict';

async function initializeRoulette(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS rr_deaths (
    username TEXT PRIMARY KEY CHECK (username = lower(username) AND length(username) > 0),
    count BIGINT NOT NULL CHECK (count >= 0 AND count <= 9007199254740991),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

module.exports = { initializeRoulette };
