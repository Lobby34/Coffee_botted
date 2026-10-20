'use strict';

// Config must be loaded first
const config = require('./config');
const logger = require('./lib/logger');
const { createClient } = require('./lib/twitch');
const { loadCommands } = require('./commands');
const { createMessageHandler } = require('./lib/messageHandler');

let messageHandler;
let brewDrops;

async function main() {
  logger.info('Starting bot...', {
    channel: config.twitch.channelName,
    bot:     config.twitch.botUsername,
    env:     config.app.nodeEnv,
    version: require('../package.json').version,
  });

  await require('./lib/database').getPool().query('SELECT 1');

  // Register command handlers.
  const commands = loadCommands();

  // Connect EventSub.
  const client = createClient();

  client.on('connected', (addr, port) => {
    logger.info(`Connected to Twitch`, { addr, port, channel: config.twitch.channelName });
  });

  messageHandler = createMessageHandler({
    commands, client, prefix: config.bot.commandPrefix, logger,
    logStore: require('./lib/commandLogStore'),
  });
  client.on('message', messageHandler);

  if (config.bot.brewEnabled) {
    const { createDropScheduler } = require('./lib/brew/scheduler');
    brewDrops=createDropScheduler({ client,service:require('./lib/brew').getService(),logger });
    client.on('connected',brewDrops.start);
  }
  await client.connect();
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal });
  const deadline = setTimeout(() => process.exit(1), 8000);
  try {
    await brewDrops?.stop();
    await messageHandler?.stop();
    await require('./lib/commandLogStore').flush();
    await require('./lib/database').close();
    clearTimeout(deadline);
    process.exit(0);
  } catch (err) {
    logger.error('Shutdown failed', { err: err.message });
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

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
