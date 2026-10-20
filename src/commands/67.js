'use strict';

const counters = require('../lib/messageCounterStore');
const gameState = require('../gameStates/67GameState');

module.exports = {
  name: '67',
  description: 'Persist every 67 match; throttle automatic replies.',
  automaticReply: true,
  matches: message => message.includes('67'),
  async observe({ client, channel, audit }) {
    const count = await counters.increment('67');
    audit?.set({ count });
    const now = performance.now();
    if (now < gameState.nextReplyAt) {
      audit?.cooldown();
      audit?.set({ cooldown_remaining_seconds: Math.ceil((gameState.nextReplyAt - now) / 1000) });
      return;
    }
    gameState.nextReplyAt = now + gameState.COOLDOWN_SECONDS * 1000;
    await client.say(channel, `This ABERRATION of a number has been said ${count} times`);
  },
  async execute() {
    // Matching messages, including !67, are handled once by observe.
  },
};
