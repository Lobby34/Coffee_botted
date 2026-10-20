'use strict';

// Add a behavior case here whenever src/commands gains a command.
module.exports = {
  brew: async ({ send,replies,assert }) => {
    const previous=process.env.BREW_ENABLED;
    process.env.BREW_ENABLED='true';
    try { await send('!brew'); assert.match(replies[0],/!brew craft/); }
    finally { if (previous === undefined) delete process.env.BREW_ENABLED; else process.env.BREW_ENABLED=previous; }
  },
  '67': async ({ send, replies, pool, assert }) => {
    await send('!67');
    await send('another 67');
    assert.equal(replies.length, 1);
    assert.match(replies[0], /said 1 times/);
    assert.equal((await pool.query("SELECT count FROM message_counters WHERE name = '67'")).rows[0].count, '2');
  },
  zuh: async ({ send, replies, pool, assert }) => {
    await send('zuh');
    await send('!zuh');
    assert.deepEqual(replies, ['1 zuh .']);
    assert.equal((await pool.query("SELECT count FROM message_counters WHERE name = 'zuh'")).rows[0].count, '1');
  },
  dadjoke: async ({ send, replies, pool, assert }) => {
    await send('!dadjoke');
    assert.equal(replies.length, 1);
    assert.ok(Number((await pool.query('SELECT count(*) FROM dadjokes WHERE joke = $1', [replies[0]])).rows[0].count) >= 1);
  },
  rrspin: async ({ send, replies, assert }) => {
    const state = require('../../src/gameStates/rrGameState');
    state.currentChambers = 2;
    await send('!rrspin');
    assert.equal(state.currentChambers, state.CHAMBERS);
    assert.match(replies[0], /game has been reset/);
  },
  rrshoot: async ({ send, replies, timeouts, pool, assert }) => {
    const originalRandom = Math.random;
    try {
      Math.random = () => 0;
      await send('!rrshoot @target');
    } finally {
      Math.random = originalRandom;
    }
    assert.match(replies[0], /F for target/);
    assert.equal(timeouts.length, 1);
    assert.equal(timeouts[0][1], 'target');
    assert.equal((await pool.query("SELECT count FROM rr_deaths WHERE username = 'target'")).rows[0].count, '1');
  },
  rrdeaths: async ({ send, replies, pool, assert }) => {
    await pool.query("INSERT INTO rr_deaths (username, count) VALUES ('leader', 3), ('viewer', 1)");
    await send('!rrdeaths');
    assert.match(replies[0], /1\. leader: 3 deaths.*2\. viewer: 1 deaths/);
  },
};
