'use strict';

// Replace only the transport; startup still loads production commands and PostgreSQL.
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const target = require.resolve('../../../src/lib/twitch');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Module._resolveFilename(request, parent) === target) {
    return {
      createClient() {
        const client = new EventEmitter();
        client.connect = async () => client.emit('connected', 'ci-mock', 443);
        return client;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
global.fetch = async () => { throw new Error('Unexpected network request in startup test'); };
