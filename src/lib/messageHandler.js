'use strict';

function createMessageHandler({ commands, client, prefix, logger }) {
  return async (channel, userstate, message, self) => {
    if (self) return;
    const [rawCommand, ...args] = message.startsWith(prefix)
      ? message.slice(prefix.length).trim().split(/\s+/) : [];
    const command = rawCommand ? commands.get(rawCommand.toLowerCase()) : undefined;
    // Counter queries are read-only; ordinary messages are observed silently.
    if (!command || typeof command.observe !== 'function') {
      for (const observer of commands.values()) {
        if (typeof observer.observe !== 'function' || !observer.matches(message)) continue;
        try {
          await observer.observe({ channel, userstate, message });
        } catch (err) {
          logger.error('Unhandled error in message counter', { command: observer.name, err: err.message });
        }
      }
    }
    if (!command) return;
    logger.info('Command invoked', { command: command.name, user: userstate.username, channel });
    try {
      await command.execute({ client, channel, userstate, message, args });
    } catch (err) {
      logger.error('Unhandled error in command', { command: command.name, err: err.message });
    }
  };
}

module.exports = { createMessageHandler };
