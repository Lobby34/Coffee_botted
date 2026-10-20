'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../../src/lib/twitch.js'), 'utf8');
function setup(fetch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-test-'));
  const config = { twitch: { accessToken: 'old', refreshToken: 'old-refresh', tokenFile: path.join(dir, 'tokens.json') } };
  const sandbox = { module: { exports: {} }, require: name => name === '../config' ? config : name === './logger' ? { info() {}, warn() {}, error() {} } : name === 'ws' ? {} : require(name), fetch, AbortSignal, URLSearchParams, setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox);
  return { client: sandbox.module.exports.createClient(), config, dir };
}
test('expired token refresh is serialized and rotated pair persists privately', async () => {
  let calls = 0;
  const ctx = setup(async () => ++calls === 1 ? { status: 401, ok: false } : { ok: true, json: async () => ({ access_token: 'new', refresh_token: 'new-refresh' }) });
  try {
    await Promise.all([ctx.client.validateAndRefreshToken(), ctx.client.validateAndRefreshToken()]);
    assert.equal(calls, 2);
    assert.equal(ctx.config.twitch.accessToken, 'new');
    assert.deepEqual(JSON.parse(fs.readFileSync(ctx.config.twitch.tokenFile)), { accessToken: 'new', refreshToken: 'new-refresh' });
    assert.equal(fs.statSync(ctx.config.twitch.tokenFile).mode & 0o777, 0o600);
  } finally { fs.rmSync(ctx.dir, { recursive: true }); }
});
test('validation outage does not rotate credentials', async () => {
  let calls = 0;
  const ctx = setup(async () => { calls++; return { status: 503, ok: false }; });
  try {
    await assert.rejects(ctx.client.validateAndRefreshToken(), /503/);
    assert.equal(calls, 1);
    assert.equal(ctx.config.twitch.accessToken, 'old');
  } finally { fs.rmSync(ctx.dir, { recursive: true }); }
});
test('near expiry triggers refresh, valid long lived token does not', async () => {
  for (const expires_in of [600, 7200]) {
    let calls = 0;
    const ctx = setup(async () => ++calls === 1 ? { ok: true, json: async () => ({ expires_in }) } : { ok: true, json: async () => ({ access_token: 'new', refresh_token: 'new-refresh' }) });
    try { await ctx.client.validateAndRefreshToken(); assert.equal(calls, expires_in === 600 ? 2 : 1); }
    finally { fs.rmSync(ctx.dir, { recursive: true }); }
  }
});
