'use strict';

// Config must be loaded first
const config = require('./config');
const logger = require('./lib/logger');
const { createClient } = require('./lib/twitch');
const { loadCommands } = require('./commands');

async function main() {
  logger.info('Starting bot...', {
    channel: config.twitch.channelName,
    bot:     config.twitch.botUsername,
    env:     config.app.nodeEnv,
  });

  // Load commands from src/commands/
  const commands = loadCommands();

  // Create and connect the tmi.js client
  const client = createClient();

  client.on('connected', (addr, port) => {
    logger.info(`Connected to Twitch`, { addr, port, channel: config.twitch.channelName });
  });

  // Main message handler
  client.on('message', async (channel, userstate, message, self) => {
    // Ignore messages sent by the bot itself
    if (self) return;

    const prefix = config.bot.commandPrefix;

    // Ignore non command prefixed messages
    if (!message.startsWith(prefix)) return;

    // Parse command name and arguments
    const [rawCommand, ...args] = message.slice(prefix.length).trim().split(/\s+/);
    const commandName = rawCommand.toLowerCase();

    const command = commands.get(commandName);
    //Ignore unknown commands
    if (!command) return;

    logger.info('Command invoked', {
      command: commandName,
      user:    userstate.username,
      channel,
    });

    try {
      await command.execute({ client, channel, userstate, args });
    } catch (err) {
      logger.error('Unhandled error in command', { command: commandName, err: err.message });
    }
  });

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
