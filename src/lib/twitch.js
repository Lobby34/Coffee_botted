'use strict';

const tmi = require('tmi.js');
const config = require('../config');
const logger = require('./logger');

/**
 * Creates and returns a configured tmi.js client.
 * Client not connected yet.
 */
function createClient() {
  const client = new tmi.Client({
    options: {
      //Logs are custom made in ../lib/logger.js
      debug: false,
    },
    identity: {
      username: config.twitch.botUsername,
      password: `oauth:${config.twitch.accessToken.replace(/^oauth:/, '')}`,
    },
    channels: [config.twitch.channelName],
    connection: {
      reconnect: true,
      secure: true,
    },
  });

  // Surface tmi's internal errors through logger
  client.on('disconnected', (reason) => {
    logger.warn('Disconnected from Twitch', { reason });
  });

  client.on('reconnect', () => {
    logger.info('Reconnecting to Twitch...');
  });

  return client;
}

module.exports = { createClient };
