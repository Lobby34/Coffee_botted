'use strict';

const gameState = require('../gameStates/messageCounterGameState');

module.exports = {
  name: '67',
  description: 'Count and reply to every message containing 67.',
  automaticReply: true,
  matches: message => message.includes('67'),
  async observe({ client, channel }) {
    const count = await gameState.increment('67');
    await client.say(channel, `This ABERRATION of a number has been said ${count} times`);
  },
  async execute() {
    // Matching messages, including !67, are handled once by observe.
  },
};
