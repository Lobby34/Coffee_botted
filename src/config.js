'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
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
    botUsername:    required('BOT_USERNAME'),
    channelName:    required('CHANNEL_NAME'),
    clientId:       required('TWITCH_CLIENT_ID'),
    clientSecret:   required('TWITCH_CLIENT_SECRET'),
    accessToken:    savedTokens.accessToken || required('TWITCH_ACCESS_TOKEN'),
    refreshToken:   savedTokens.refreshToken || required('TWITCH_REFRESH_TOKEN'),
  },

  database: {
    host: optional('DB_HOST', 'postgres'),
    port: Number(optional('DB_PORT', '5432')),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
  },

  bot: {
    commandPrefix: optional('COMMAND_PREFIX', '!'),
  },

  app: {
    nodeEnv: optional('NODE_ENV', 'development'),
    isDev:   optional('NODE_ENV', 'development') === 'development',
  },
};

module.exports = config;
