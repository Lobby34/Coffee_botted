'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const cases = require('./commandCases');

test('every discovered command has and passes a behavior case', { skip: !process.env.COUNTER_TEST_DB, timeout: 30000 }, async t => {
  require('dotenv').config();
  process.env.DB_HOST = process.env.COUNTER_TEST_HOST || '127.0.0.1';
  const schema = `commands_ci_${process.pid}_${Date.now()}`;
  const admin = new Pool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const previousOptions = process.env.PGOPTIONS;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const database = require('../../src/lib/database');
  const pool = database.getPool();
  try {
    const { initializeDatabase } = require('../../src/DB/Initialization');
    await initializeDatabase(pool);
    const { loadCommands } = require('../../src/commands');
    const { createMessageHandler } = require('../../src/lib/messageHandler');
    const { createCommandLogStore } = require('../../src/lib/commandLogStore');
    const logStore = createCommandLogStore(pool, { error: (...args) => { throw new Error(JSON.stringify(args)); } });
    const commands = loadCommands();
    const files = fs.readdirSync(path.resolve(__dirname, '../../src/commands')).filter(file => file.endsWith('.js') && file !== 'index.js');
    assert.equal(commands.size, files.length, 'Invalid or duplicate command modules were skipped');
    assert.deepEqual([...commands.keys()].sort(), Object.keys(cases).sort(), 'Add a behavior case in .github/checks/commandCases.js for each command');
    for (const [name, command] of commands) {
      await t.test(name, async () => {
        assert.equal(typeof command.description, 'string');
        assert.ok(command.description.trim());
        if (command.observe) {
          assert.equal(typeof command.observe, 'function');
          assert.equal(typeof command.matches, 'function');
        }
        await pool.query('TRUNCATE rr_deaths, command_logs');
        await pool.query('UPDATE message_counters SET count = 0');
        Object.assign(require('../../src/gameStates/67GameState'), { nextReplyAt: 0 });
        Object.assign(require('../../src/gameStates/dadjokeGameState'), { isOnCooldown: false, COOLDOWN_SECONDS: 0 });
        Object.assign(require('../../src/gameStates/rrGameState'), { isOnCooldown: false, isDeathOnCooldown: false, COOLDOWN_SECONDS: 0, currentChambers: 6 });
        const replies = [];
        const timeouts = [];
        const errors = [];
        const client = { say: async (_, text) => replies.push(text), timeout: async (...args) => timeouts.push(args) };
        const handler = createMessageHandler({ commands, client, logStore, prefix: '!', logger: { info() {}, error: (...args) => errors.push(args) } });
        const send = message => handler('ci_channel', { username: 'viewer', 'display-name': 'Viewer' }, message, false);
        await cases[name]({ send, replies, timeouts, pool, assert });
        assert.deepEqual(errors, [], 'Command errors must fail CI');
        const result = await pool.query('SELECT * FROM command_logs WHERE command = $1 ORDER BY id', [name]);
        assert.ok(result.rowCount > 0, 'Every command must write an audit entry');
        assert.equal(result.rows[0].username, 'viewer');
        if (name === 'rrshoot') {
          const log = result.rows[0];
          assert.equal(log.variables.roll, 1);
          assert.equal(log.variables.chambers_before, 6);
          assert.equal(log.variables.chambers_remaining, 5);
          assert.equal(log.variables.next_chambers, 6);
          assert.equal(log.variables.target, 'target');
          assert.equal(log.responses[0].status, 'sent');
          assert.equal(log.actions[0].status, 'completed');
        }
        if (name === '67') {
          assert.equal(result.rowCount, 2);
          assert.equal(result.rows[1].status, 'cooldown');
          assert.equal(result.rows[1].variables.count, 2);
          assert.deepEqual(result.rows[1].responses, []);
        }
      });
    }
  } finally {
    await database.close();
    if (previousOptions === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = previousOptions;
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
