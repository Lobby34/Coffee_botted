'use strict';

const gameState = require('../gameStates/messageCounterGameState');

module.exports = {
  name: 'zuh',
  description: 'Show the persistent zuh message count.',
  matches: message => message.toLowerCase().includes('zuh'),
  observe() {
    gameState.increment('zuh');
  },
  async execute({ client, channel }) {
    const count = gameState.get('zuh');
    await client.say(channel, `${count} zuh .`);
  },
};
