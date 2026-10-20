'use strict';

const { runAudited } = require('./commandAudit');

function createMessageHandler({ commands, client, prefix, logger, logStore }) {
  async function handle(channel, userstate, message, self) {
    if (self) return;
    const [rawCommand, ...args] = message.startsWith(prefix)
      ? message.slice(prefix.length).trim().split(/\s+/) : [];
    const command = rawCommand ? commands.get(rawCommand.toLowerCase()) : undefined;
    const pending = [];
    const invoke = (observer, trigger, execute) => runAudited({
      command: observer, trigger, execute, client, channel, userstate, message, args, logger, logStore,
    });
    // Counter queries remain read-only; automatic replies also observe commands.
    for (const observer of commands.values()) {
      if (typeof observer.observe !== 'function' || !observer.matches(message)) continue;
      if (!observer.automaticReply && command && typeof command.observe === 'function') continue;
      pending.push(invoke(observer, observer.automaticReply ? 'automatic' : 'observer', context => observer.observe(context)));
    }
    if (command && !command.automaticReply) {
      logger.info('Command invoked', { command: command.name, user: userstate.username, channel });
      pending.push(invoke(command, 'command', context => command.execute(context)));
    }
    await Promise.all(pending);
  }
  const active = new Set();
  let stopped = false;
  const handler = (...args) => {
    if (stopped) return Promise.resolve();
    const execution = handle(...args);
    active.add(execution);
    execution.then(() => active.delete(execution), () => active.delete(execution));
    return execution;
  };
  handler.stop = async () => {
    stopped = true;
    await Promise.allSettled([...active]);
  };
  return handler;
}

module.exports = { createMessageHandler };
