'use strict';

const gameState = require('../gameStates/messageCounterGameState');

module.exports = {
  name: '67',
  description: 'Show the persistent 67 message count.',
  matches: message => message.toLowerCase().includes('67'),
  observe() {
    gameState.increment('67');
  },
  async execute({ client, channel }) {
    const count = gameState.get('67');
    await client.say(channel, `This ABERRATION of a number has been said ${count} times so far`);
  },
};
