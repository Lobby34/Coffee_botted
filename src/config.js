'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const tokenMode = optional('TWITCH_TOKEN_MODE', 'local');
if (!['local', 'managed'].includes(tokenMode)) throw new Error('Invalid TWITCH_TOKEN_MODE');
const tokenFile = process.env.TWITCH_TOKEN_FILE || path.resolve(__dirname, '../data/twitch-tokens.json');
const savedTokens = fs.existsSync(tokenFile)
  ? JSON.parse(fs.readFileSync(tokenFile, 'utf8')) : {};


/**
 * Reads a required environment variable.
 * Throws a clear error at startup if it's missing, so the bot never
 * silently starts in a broken state.
 */
function required(key) {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optional(key, defaultValue) {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : defaultValue;
}

const config = {
  twitch: {
    tokenFile,
    tokenMode,
    managedOverrideFile: optional('TWITCH_MANAGED_OVERRIDE_FILE', ''),
    botUsername:    required('BOT_USERNAME'),
    channelName:    required('CHANNEL_NAME'),
    clientId:       required('TWITCH_CLIENT_ID'),
    clientSecret:   required('TWITCH_CLIENT_SECRET'),
    accessToken:    savedTokens.accessToken || required('TWITCH_ACCESS_TOKEN'),
    refreshToken:   tokenMode === 'managed' ? undefined : savedTokens.refreshToken || required('TWITCH_REFRESH_TOKEN'),
  },

  database: require('./DB/config').databaseConfig(),

  bot: {
    commandPrefix: optional('COMMAND_PREFIX', '!'),
    brewEnabled: optional('BREW_ENABLED','false') === 'true',
  },

  app: {
    nodeEnv: optional('NODE_ENV', 'development'),
    isDev:   optional('NODE_ENV', 'development') === 'development',
  },
};

module.exports = config;
