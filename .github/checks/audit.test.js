'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMessageHandler } = require('../../src/lib/messageHandler');
const { createCommandLogStore } = require('../../src/lib/commandLogStore');

const logger = { info() {}, error() {} };

test('concurrent invocations keep responses, arguments and variables separate', async () => {
  const entries = [];
  const commands = new Map([['roll', {
    name: 'roll',
    async execute({ client, channel, args, audit }) {
      audit.set({ roll: Number(args[0]), chambers_remaining: 4 });
      await new Promise(resolve => setImmediate(resolve));
      await client.say(channel, 'roll ' + args[0]);
      await client.timeout(channel, 'target', 10, 'test');
    },
  }]]);
  const handler = createMessageHandler({
    commands, prefix: '!', logger,
    client: { say: async () => {}, timeout: async () => {} },
    logStore: { record: async entry => entries.push(entry) },
  });
  await Promise.all([handler('channel', { username: 'one', 'user-id': '1' }, '!roll 2', false), handler('channel', { username: 'two' }, '!roll 5', false)]);
  assert.equal(entries.length, 2);
  for (const entry of entries) {
    assert.equal(entry.variables.roll, Number(entry.args[0]));
    assert.equal(entry.responses[0].text, 'roll ' + entry.args[0]);
    assert.equal(entry.responses[0].status, 'sent');
    assert.equal(entry.actions[0].username, 'target');
    assert.equal(entry.status, 'completed');
    assert.ok(entry.completedAt >= entry.startedAt);
  }
  assert.equal(entries.find(e => e.username === 'one').userId, '1');
});

test('cooldowns, errors and failed replies are recorded; self messages are ignored', async () => {
  const entries = [];
  const commands = new Map([
    ['cool', { name: 'cool', execute: async ({ audit }) => audit.cooldown() }],
    ['fail', { name: 'fail', execute: async () => { throw new Error('broken command'); } }],
    ['send', { name: 'send', execute: async ({ client }) => client.say('channel', 'reply') }],
  ]);
  const handler = createMessageHandler({
    commands, prefix: '!', logger, client: { say: async () => { throw new Error('Twitch offline'); } },
    logStore: { record: async entry => entries.push(entry) },
  });
  const send = (message, self = false) => handler('channel', { username: 'viewer' }, message, self);
  await send('!cool'); await send('!fail'); await send('!send'); await send('!send', true); await send('ordinary chat');
  assert.equal(entries.length, 3);
  assert.equal(entries[0].status, 'cooldown');
  assert.deepEqual(entries[0].responses, []);
  assert.equal(entries[1].error, 'broken command');
  assert.equal(entries[1].status, 'error');
  assert.equal(entries[2].responses[0].status, 'failed');
  assert.equal(entries[2].error, 'Twitch offline');
});

test('audit failure never prevents a response; shutdown waits for active invocations', async () => {
  const effects = [];
  let release;
  const write = new Promise(resolve => { release = resolve; });
  const handler = createMessageHandler({
    commands: new Map([['test', { name: 'test', execute: async ({ client }) => client.say('channel', 'reply') }]]),
    prefix: '!', logger, client: { say: async () => effects.push('reply') },
    logStore: { record: async () => { effects.push('audit'); await write; throw new Error('offline'); } },
  });
  const work = handler('channel', { username: 'viewer' }, '!test', false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(effects, ['reply', 'audit']);
  let drained = false;
  const shutdown = handler.stop().then(() => { drained = true; });
  await handler('channel', { username: 'viewer' }, '!test', false);
  assert.equal(drained, false);
  assert.equal(effects.length, 2);
  release();
  await work; await shutdown;
  assert.equal(drained, true);
});

test('audit queue is bounded, flushes pending writes and contains database errors', async () => {
  let release;
  const query = new Promise(resolve => { release = resolve; });
  const errors = [];
  const store = createCommandLogStore({ query: () => query }, { error: (...args) => errors.push(args) }, 1);
  const entry = { command: 'test', responses: [], actions: [], variables: {} };
  const first = store.record(entry);
  assert.equal(await store.record(entry), false);
  let flushed = false;
  const flush = store.flush().then(() => { flushed = true; });
  assert.equal(flushed, false);
  release();
  assert.equal(await first, true);
  await flush;
  assert.equal(errors.length, 1);
  const broken = createCommandLogStore({ query: async () => { throw new Error('DB offline'); } }, logger);
  assert.equal(await broken.record(entry), false);
  await broken.flush();
});
