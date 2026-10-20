'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMessageHandler } = require('../../src/lib/messageHandler');

test('slow automatic reply does not hold up a separate command', async () => {
  let release;
  const slow = new Promise(resolve => { release = resolve; });
  let executed = false;
  const commands = new Map([
    ['67', { automaticReply: true, matches: () => true, observe: () => slow }],
    ['test', { name: 'test', execute: async () => { executed = true; } }],
  ]);
  const handler = createMessageHandler({ commands, prefix: '!', client: {}, logger: { info() {}, error() {} } });
  const pending = handler('channel', { username: 'viewer' }, '!test 67', false);
  try { assert.equal(executed, true); } finally { release(); await pending; }
});

test('chat send records latency and reports Twitch rejection or dropped messages', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  for (const mode of ['sent', 'dropped', 'error']) {
    const entries = [];
    const sandbox = {
      module: { exports: {} }, AbortSignal, performance,
      require: name => name === '../config' ? { twitch: { clientId: 'app' } } : name === './logger' ? { info: (...args) => entries.push(args) } : require(name),
      fetch: async () => ({ ok: mode !== 'error', status: mode === 'error' ? 401 : 200, json: async () => ({ message: 'Unauthorized', data: [{ is_sent: mode === 'sent', drop_reason: { message: 'Rejected' } }] }) }),
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../../src/lib/twitch'), 'utf8'), sandbox);
    const client = sandbox.module.exports.createClient();
    client.broadcaster = { id: 'channel' }; client.botUser = { id: 'bot' };
    if (mode === 'sent') {
      await client.say('channel', 'reply');
      assert.equal(entries[0][0], 'Chat reply sent');
      assert.ok(entries[0][1].durationMs >= 0);
    } else {
      await assert.rejects(client.say('channel', 'reply'), mode === 'error' ? /401/ : /Rejected/);
    }
  }
});
