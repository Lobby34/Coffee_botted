'use strict';

const { Pool } = require('pg');

let pool;
function getPool() {
  if (!pool) {
    const config = require('../DB/config').databaseConfig();
    pool = new Pool({
      ...config, max: 5, min: 1, keepAlive: true,
      connectionTimeoutMillis: 5000, statement_timeout: 10000,
    });
    pool.on('error', err => require('./logger').error('Database pool error', { err: err.message }));
  }
  return pool;
}

module.exports = { getPool, close: () => pool ? pool.end() : Promise.resolve() };
