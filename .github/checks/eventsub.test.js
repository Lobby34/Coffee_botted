'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
function setup() {
  const timers = new Set();
  const sockets = [];
  class Socket extends EventEmitter {
    constructor(url) { super(); this.url = url; sockets.push(this); }
    terminate() { this.terminated = true; }
  }
  const sandbox = {
    module: { exports: {} }, AbortSignal, URLSearchParams,
    require: name => name === 'ws' ? Socket : name === '../config' ? { twitch: {} } : name === './logger' ? { info() {}, warn() {}, error() {} } : require(name),
    setTimeout: (fn, delay) => { const timer = { fn, delay }; timers.add(timer); return timer; },
    clearTimeout: timer => timers.delete(timer),
    fetch: async () => ({ ok: true, json: async () => ({ data: [], pagination: {} }) }),
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../src/lib/twitch'), 'utf8'), sandbox);
  const client = sandbox.module.exports.createClient();
  client.broadcaster = { id: 'channel' }; client.botUser = { id: 'bot' };
  let subscriptions = 0;
  client.subscribeToChat = async () => { subscriptions++; };
  const send = async (socket, type, payload = {}) => {
    socket.emit('message', JSON.stringify({ metadata: { message_type: type, subscription_type: 'channel.chat.message' }, payload }));
    await new Promise(resolve => setImmediate(resolve));
  };
  const welcome = socket => send(socket, 'session_welcome', { session: { id: 'session', keepalive_timeout_seconds: 10 } });
  return { client, sockets, timers, send, welcome, subscriptions: () => subscriptions };
}
test('missed keepalive tears down socket and schedules one fresh connection', async () => {
  const ctx = setup(); ctx.client.openSocket(); const socket = ctx.sockets[0];
  await ctx.welcome(socket);
  const oldTimer = socket.watchdog;
  await ctx.send(socket, 'session_keepalive');
  assert.ok(!ctx.timers.has(oldTimer));
  socket.watchdog.fn();
  assert.equal(socket.terminated, true);
  assert.equal(ctx.client.ws, null);
  const retry = ctx.client.reconnectTimer;
  ctx.client.reconnect(); assert.equal(ctx.client.reconnectTimer, retry);
  let connected = false; ctx.client.connect = () => { connected = true; };
  retry.fn(); assert.equal(connected, true);
});
test('migration keeps old connection delivering until welcome and does not resubscribe', async () => {
  const ctx = setup(); ctx.client.openSocket(); const old = ctx.sockets[0]; await ctx.welcome(old);
  await ctx.send(old, 'session_reconnect', { session: { reconnect_url: 'wss://migration' } });
  const next = ctx.sockets[1]; assert.equal(next.url, 'wss://migration'); assert.ok(!old.terminated);
  let received = 0; ctx.client.handleIncomingMessage = () => received++;
  await ctx.send(old, 'notification', { event: {} }); assert.equal(received, 1);
  await ctx.welcome(next); assert.equal(old.terminated, true); assert.equal(ctx.subscriptions(), 1);
});
test('revocation and missing subscription both trigger recovery', async () => {
  for (const revoked of [true, false]) {
    const ctx = setup(); ctx.client.openSocket(); const socket = ctx.sockets[0]; await ctx.welcome(socket);
    if (revoked) await ctx.send(socket, 'revocation', { subscription: { type: 'channel.chat.message', status: 'authorization_revoked' } });
    else await ctx.client.checkSubscription();
    assert.equal(socket.terminated, true); assert.ok(ctx.client.reconnectTimer);
  }
});
test('subscription creation failure recovers instead of leaving an idle socket', async () => {
  const ctx = setup(); ctx.client.subscribeToChat = async () => { throw new Error('rejected'); };
  ctx.client.openSocket(); const socket = ctx.sockets[0]; await ctx.welcome(socket);
  assert.equal(socket.terminated, true); assert.ok(ctx.client.reconnectTimer);
});
