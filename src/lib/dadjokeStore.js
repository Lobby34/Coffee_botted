'use strict';

const { getPool } = require('./database');

function createJokeStore(pool) {
  return {
    async random() {
      const result = await pool.query('SELECT joke FROM dadjokes ORDER BY random() LIMIT 1');
      return result.rows[0]?.joke;
    },
  };
}

let store;
function defaultStore() {
  if (!store) store = createJokeStore(getPool());
  return store;
}
module.exports = {
  createJokeStore,
  random: () => defaultStore().random(),
};
