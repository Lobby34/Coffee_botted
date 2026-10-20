'use strict';

// Config must be loaded first
const config = require('./config');
const logger = require('./lib/logger');
const { createClient } = require('./lib/twitch');
const { loadCommands } = require('./commands');
const { createMessageHandler } = require('./lib/messageHandler');

async function main() {
  logger.info('Starting bot...', {
    channel: config.twitch.channelName,
    bot:     config.twitch.botUsername,
    env:     config.app.nodeEnv,
  });

  await require('./gameStates/messageCounterGameState').initialize();
  await require('./gameStates/dadjokeStore').initialize();
  logger.info('PostgreSQL message counters and dad jokes ready');

  // Load commands from src/commands/
  const commands = loadCommands();

  // Create and connect the tmi.js client
  const client = createClient();

  client.on('connected', (addr, port) => {
    logger.info(`Connected to Twitch`, { addr, port, channel: config.twitch.channelName });
  });

  client.on('message', createMessageHandler({
    commands, client, prefix: config.bot.commandPrefix, logger,
  }));

  await client.connect();
}

// Graceful shutdown on SIGINT/SIGTERM
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Global error handlers
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err: err.message, stack: err.stack });
  process.exit(1); 
});

  // Config validation errors will surface here
main().catch((err) => {
  logger.error('Fatal startup error', { err: err.message });
  process.exit(1);
});
