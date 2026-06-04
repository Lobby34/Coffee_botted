'use strict';

require('dotenv').config();

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
    botUsername:    required('BOT_USERNAME'),
    channelName:    required('CHANNEL_NAME'),
    clientId:       required('TWITCH_CLIENT_ID'),
    clientSecret:   required('TWITCH_CLIENT_SECRET'),
    accessToken:    required('TWITCH_ACCESS_TOKEN'),
    refreshToken:   required('TWITCH_REFRESH_TOKEN'),
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
