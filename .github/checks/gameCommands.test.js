'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('67 persists every match while replying only once per cooldown', async () => {
  let now = 0;
  let count = 0;
  const state = { COOLDOWN_SECONDS: 5, nextReplyAt: 0 };
  const replies = [];
  let failed = false;
  const sandbox = {
    module: { exports: {} },
    performance: { now: () => now },
    require: name => name.endsWith('67GameState') ? state : {
      increment: async () => { if (failed) throw new Error('offline'); return ++count; },
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../src/commands/67'), 'utf8'), sandbox);
  const observe = () => sandbox.module.exports.observe({ channel: 'channel', client: { say: async (_, text) => replies.push(text) } });
  await Promise.all(Array.from({ length: 20 }, observe));
  assert.equal(count, 20);
  assert.equal(replies.length, 1);
  now = 4999;
  await observe();
  assert.equal(count, 21);
  assert.equal(replies.length, 1);
  now = 5000;
  await observe();
  assert.equal(replies.length, 2);
  assert.match(replies[1], /22 times/);
  now = 10000;
  failed = true;
  await assert.rejects(observe(), /offline/);
  assert.equal(state.nextReplyAt, 10000);
  failed = false;
  await observe();
  assert.equal(replies.length, 3);
});

test('roulette persists a death before sending chat or applying timeout', async () => {
  const effects = [];
  const state = { currentChambers: 1, CHAMBERS: 6, COOLDOWN_SECONDS: 10 };
  const sandbox = {
    module: { exports: {} },
    require: name => name.endsWith('rrGameState') ? state : name.endsWith('rouletteStore') ? {
      increment: async username => effects.push('persist:' + username),
    } : { info() {}, warn() {}, error() {} },
    setTimeout() {},
    Math: { random: () => 0, floor: Math.floor },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../src/commands/rrshoot'), 'utf8'), sandbox);
  await sandbox.module.exports.execute({
    client: { say: async () => effects.push('say'), timeout: async () => effects.push('timeout') },
    channel: 'channel', userstate: { username: 'viewer' }, args: [],
  });
  assert.deepEqual(effects, ['persist:viewer', 'say', 'timeout']);
});
