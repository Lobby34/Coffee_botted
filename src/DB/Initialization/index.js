'use strict';

const path = require('path');
const { initializeCounters } = require('./messageCounters');
const { initializeDadJokes } = require('./dadjokes');
const { initializeRoulette } = require('./roulette');

async function initializeDatabase(pool) {
  await initializeCounters(pool, process.env.MESSAGE_COUNTER_FILE || path.resolve(__dirname, '../../../data/message-counters.json'));
  await initializeDadJokes(pool, path.resolve(__dirname, '../../data/jokes.txt'));
  await initializeRoulette(pool);
}

if (require.main === module) {
  require('../../config');
  const database = require('../../lib/database');
  (async () => {
    try {
      await initializeDatabase(database.getPool());
      require('../../lib/logger').info('PostgreSQL schema ready');
    } finally {
      await database.close();
    }
  })().catch(err => {
    console.error('Database initialization failed:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { initializeDatabase };
