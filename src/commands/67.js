'use strict';

const gameState = require('../gameStates/messageCounterGameState');

module.exports = {
  name: '67',
  description: 'Count chat messages containing 67.',
  matches: message => message.toLowerCase().includes('67'),
  async execute({ client, channel }) {
    const count = gameState.increment('67');
    await client.say(channel, `This ABERRATION of a number has been said ${count} times`);
  },
};
