'use strict';

// A separate client wrapper per invocation prevents concurrent commands sharing replies.
async function runAudited({ command, trigger, client, channel, userstate, message, args, logger, logStore, execute }) {
  const started = performance.now();
  const entry = {
    startedAt: new Date(), channel, username: userstate.username || 'unknown',
    userId: userstate['user-id'] || null, displayName: userstate['display-name'] || null,
    command: command.name, trigger, message, args, status: 'completed',
    responses: [], actions: [], variables: {}, error: null,
  };
  const audit = {
    set: values => Object.assign(entry.variables, values),
    cooldown: () => { if (entry.status !== 'error') entry.status = 'cooldown'; },
    error: err => { entry.status = 'error'; entry.error = err.message || String(err); },
  };
  const scopedClient = new Proxy(client, {
    get(target, key) {
      if (key === 'say') return async (replyChannel, text) => {
        const reply = { channel: replyChannel, text, status: 'sent' };
        entry.responses.push(reply);
        try {
          return await target.say(replyChannel, text);
        } catch (err) {
          reply.status = 'failed';
          reply.error = err.message;
          audit.error(err);
          throw err;
        }
      };
      if (key === 'timeout') return async (actionChannel, username, duration, reason) => {
        const action = { type: 'timeout', channel: actionChannel, username, duration, reason, status: 'completed' };
        entry.actions.push(action);
        try {
          return await target.timeout(actionChannel, username, duration, reason);
        } catch (err) {
          action.status = 'failed';
          action.error = err.message;
          audit.error(err);
          throw err;
        }
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  try {
    await execute({ client: scopedClient, channel, userstate, message, args, audit });
  } catch (err) {
    audit.error(err);
    logger.error('Unhandled error in command', { command: command.name, err: err.message });
  } finally {
    entry.completedAt = new Date();
    entry.durationMs = Math.round(performance.now() - started);
    // Replies have already been dispatched; audit writes never gate a reply.
    if (logStore) {
      try { await logStore.record(entry); }
      catch (err) { logger.error('Failed to persist command audit', { command: command.name, err: err.message }); }
    }
  }
}

module.exports = { runAudited };
