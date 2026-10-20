'use strict';

function createMessageHandler({ commands, client, prefix, logger }) {
  return async (channel, userstate, message, self) => {
    if (self) return;
    const [rawCommand, ...args] = message.startsWith(prefix)
      ? message.slice(prefix.length).trim().split(/\s+/) : [];
    const command = rawCommand ? commands.get(rawCommand.toLowerCase()) : undefined;
    const pending = [];
    // Automatic replies also run on query messages; silent counter queries stay read-only.
    {
      for (const observer of commands.values()) {
        if (typeof observer.observe !== 'function' || !observer.matches(message)) continue;
        if (!observer.automaticReply && command && typeof command.observe === 'function') continue;
        pending.push((async () => {
          try {
            await observer.observe({ client, channel, userstate, message });
          } catch (err) {
            logger.error('Unhandled error in message counter', { command: observer.name, err: err.message });
          }
        })());
      }
    }
    if (command && !command.automaticReply) {
      pending.push((async () => {
        logger.info('Command invoked', { command: command.name, user: userstate.username, channel });
        try {
          await command.execute({ client, channel, userstate, message, args });
        } catch (err) {
          logger.error('Unhandled error in command', { command: command.name, err: err.message });
        }
      })());
    }
    await Promise.all(pending);
  };
}

module.exports = { createMessageHandler };
