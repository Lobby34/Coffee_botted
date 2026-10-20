'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Pool } = require('pg');
const { createJokeStore } = require('../../src/lib/dadjokeStore');
const { initializeDadJokes } = require('../../src/DB/Initialization/dadjokes');

test('dad jokes import completely once and live database edits are used', { skip: !process.env.COUNTER_TEST_DB }, async () => {
  require('dotenv').config();
  const connection = { host: process.env.COUNTER_TEST_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME };
  const admin = new Pool(connection);
  const schema = `dadjoke_test_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ ...connection, options: `-c search_path=${schema}` });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadjokes-'));
  const file = path.join(dir, 'jokes.txt');
  try {
    const store = createJokeStore(pool, file);
    fs.writeFileSync(file, ' \n');
    await assert.rejects(initializeDadJokes(pool, file), /empty/);
    const expected = fs.readFileSync(path.join(__dirname, '../../src/data/jokes.txt'), 'utf8').split('\n').map(x => x.trim()).filter(Boolean);
    fs.writeFileSync(file, expected.join('\n'));
    await initializeDadJokes(pool, file);
    const imported = await pool.query('SELECT joke FROM dadjokes ORDER BY id');
    assert.deepEqual(imported.rows.map(x => x.joke), expected);
    assert.ok(expected.includes(await store.random()));
    fs.unlinkSync(file);
    const restarted = createJokeStore(pool, file);
    await initializeDadJokes(pool, file);
    assert.equal((await pool.query('SELECT count(*) FROM dadjokes')).rows[0].count, String(expected.length));
    await pool.query('DELETE FROM dadjokes');
    assert.equal(await restarted.random(), undefined);
    await pool.query('INSERT INTO dadjokes (joke) VALUES ($1)', ['Added from pgAdmin']);
    assert.equal(await store.random(), 'Added from pgAdmin');
    await assert.rejects(pool.query("INSERT INTO dadjokes (joke) VALUES ('   ')"), /check constraint/);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dadjoke command uses database results, respects cooldown and handles failure or empty table', async () => {
  for (const mode of ['success', 'empty', 'error']) {
    const state = { isOnCooldown: false, COOLDOWN_SECONDS: 10 };
    const timers = [];
    let calls = 0;
    const sandbox = {
      module: { exports: {} },
      require: name => name.endsWith('dadjokeGameState') ? state : name.endsWith('dadjokeStore') ? {
        random: async () => { calls++; if (mode === 'error') throw new Error('offline'); return mode === 'empty' ? undefined : 'Database joke'; },
      } : { info() {}, error() {} },
      setTimeout: (fn, ms) => timers.push({ fn, ms }),
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../../src/commands/dadjoke'), 'utf8'), sandbox);
    const replies = [];
    const args = { client: { say: async (channel, text) => replies.push(text) }, channel: 'channel', userstate: { username: 'viewer' } };
    await sandbox.module.exports.execute(args);
    await sandbox.module.exports.execute(args);
    assert.equal(calls, 1);
    assert.equal(replies.length, 1);
    assert.equal(replies[0], mode === 'success' ? 'Database joke' : mode === 'empty' ? "I'm out of jokes! Please add some to the dadjokes table." : 'My joke book is stuck closed right now! Sadge');
    assert.equal(timers[0].ms, 10000);
    timers[0].fn();
    assert.equal(state.isOnCooldown, false);
  }
});
