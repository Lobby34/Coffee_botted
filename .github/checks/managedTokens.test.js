'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('managed development tokens reload without rotating or writing production credentials', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-twitch-'));
  const file = path.join(directory, 'tokens.json');
  let calls = 0;
  const config = { twitch: { tokenMode: 'managed', tokenFile: file, accessToken: 'stale' } };
  const sandbox = {
    module: { exports: {} }, AbortSignal, URLSearchParams,
    require: name => name === '../config' ? config : name === './logger' ? { info() {}, warn() {}, error() {} } : require(name),
    fetch: async (_, options) => {
      calls++;
      assert.equal(options.headers.Authorization, 'OAuth fresh');
      return { ok: true, status: 200, json: async () => ({ expires_in: 600 }) };
    },
  };
  try {
    const original = JSON.stringify({ accessToken: 'fresh', refreshToken: 'never-use-this' });
    fs.writeFileSync(file, original);
    vm.runInNewContext(fs.readFileSync(require.resolve('../../src/lib/twitch'), 'utf8'), sandbox);
    const client = sandbox.module.exports.createClient();
    await client.validateAndRefreshToken();
    assert.equal(calls, 1);
    assert.equal(config.twitch.accessToken, 'fresh');
    await assert.rejects(client.performTokenRefresh(), /only be refreshed by their owner/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    fs.writeFileSync(file, JSON.stringify({ accessToken: 'rotated-by-owner' }));
    assert.equal(client.userAccessToken(), 'rotated-by-owner');
    fs.writeFileSync(file, '{}');
    await assert.rejects(client.validateAndRefreshToken(), /no access token/);
    assert.equal(calls, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
