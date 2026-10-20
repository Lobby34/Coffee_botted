'use strict';

const { getPool } = require('./database');

function createCommandLogStore(pool, logger, maxPending = 1000) {
  const pending = new Set();
  return {
    record(entry) {
      if (pending.size >= maxPending) {
        logger.error('Command audit queue full; entry dropped', { command: entry.command });
        return Promise.resolve(false);
      }
      const write = (async () => {
        try {
          await pool.query(`INSERT INTO command_logs (
            started_at, completed_at, duration_ms, channel, username, user_id, display_name,
            command, trigger, message, arguments, status, responses, actions, variables, error
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16)`, [
            entry.startedAt, entry.completedAt, entry.durationMs, entry.channel,
            entry.username, entry.userId, entry.displayName, entry.command, entry.trigger,
            entry.message, entry.args, entry.status, JSON.stringify(entry.responses),
            JSON.stringify(entry.actions), JSON.stringify(entry.variables), entry.error,
          ]);
          return true;
        } catch (err) {
          logger.error('Failed to persist command audit', { command: entry.command, err: err.message });
          return false;
        }
      })();
      pending.add(write);
      write.then(() => pending.delete(write), () => pending.delete(write));
      return write;
    },
    async flush() {
      while (pending.size) await Promise.all([...pending]);
    },
  };
}

let store;
function defaultStore() {
  if (!store) store = createCommandLogStore(getPool(), require('./logger'));
  return store;
}

module.exports = {
  createCommandLogStore,
  record: entry => defaultStore().record(entry),
  flush: () => store ? store.flush() : Promise.resolve(),
};
