'use strict';

const gameState = require('../gameStates/messageCounterGameState');

module.exports = {
  name: 'zuh',
  description: 'Count chat messages containing zuh.',
  matches: message => message.toLowerCase().includes('zuh'),
  async execute({ client, channel }) {
    const count = gameState.increment('zuh');
    await client.say(channel, `GOAT DETECTED zuh ACCEPTED. ADDED TO THE COUNTER. ${count} zuh SO FAR`);
  },
};
