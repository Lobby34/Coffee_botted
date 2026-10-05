'use strict';

function createMessageHandler({ commands, client, prefix, logger }) {
  return async (channel, userstate, message, self) => {
    if (self) return;
    async function execute(command, args = []) {
      try {
        await command.execute({ client, channel, userstate, message, args });
      } catch (err) {
        logger.error('Unhandled error in command', { command: command.name, err: err.message });
      }
    }
    // Automatic commands inspect the whole message, independently of the prefix.
    const matching = [...commands.values()].filter(command =>
      typeof command.matches === 'function' && command.matches(message));
    await Promise.all(matching.map(command => execute(command)));
    if (!message.startsWith(prefix)) return;
    const [rawCommand, ...args] = message.slice(prefix.length).trim().split(/\s+/);
    const command = commands.get(rawCommand.toLowerCase());
    // Automatic commands have already run above, including !67 and !zuh.
    if (!command || typeof command.matches === 'function') return;
    logger.info('Command invoked', { command: command.name, user: userstate.username, channel });
    await execute(command, args);
  };
}

module.exports = { createMessageHandler };
