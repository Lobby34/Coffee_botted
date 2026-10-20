'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { Pool } = require('pg');

test('production entry point starts with PostgreSQL and a mocked Twitch transport', { skip: !process.env.COUNTER_TEST_DB, timeout: 30000 }, async () => {
  require('dotenv').config();
  const host = process.env.COUNTER_TEST_HOST || '127.0.0.1';
  const admin = new Pool({ host, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const schema = `startup_ci_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ host, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: `-c search_path=${schema}` });
  let child;
  let exited;
  try {
    await require('../../src/DB/Initialization').initializeDatabase(pool);
    child = spawn(process.execPath, ['--require', path.join(__dirname, 'fixtures/twitch.js'), 'src/bot.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DB_HOST: host, PGOPTIONS: `-c search_path=${schema}`, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    exited = once(child, 'exit');
    let output = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out:\n' + output)), 15000);
      const finish = fn => value => { clearTimeout(timer); fn(value); };
      child.once('error', finish(reject));
      child.once('exit', finish(code => reject(new Error('Bot exited before connecting (' + code + '):\n' + output))));
      const capture = chunk => {
        output += chunk.toString();
        if (output.includes('"message":"Connected to Twitch"')) finish(resolve)();
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
    });
    assert.match(output, /Loaded command/);
    assert.equal(child.exitCode, null);
    child.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, 0, output);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
