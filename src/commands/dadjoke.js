'use strict';

const logger = require('../lib/logger');
const gameState = require('../gameStates/dadjokeGameState');
const jokes = require('../lib/dadjokeStore');

const dadjoke = {
  name: 'dadjoke',
  description: 'Send a random PostgreSQL dad joke.',

  async execute({ client, channel, userstate }) {
    if (gameState.isOnCooldown) {
      return; 
    }

    gameState.isOnCooldown = true;
    setTimeout(() => {
      gameState.isOnCooldown = false;
    }, gameState.COOLDOWN_SECONDS * 1000);

    try {
      const randomJoke = await jokes.random();
      if (!randomJoke) {
        await client.say(channel, "I'm out of jokes! Please add some to the dadjokes table.");
        return;
      }

      await client.say(channel, randomJoke);
      logger.info('Told a dad joke', { user: userstate.username });

    } catch (err) {
      logger.error('Failed to load dad joke from PostgreSQL', { err: err.message });
      await client.say(channel, "My joke book is stuck closed right now! Sadge");
    }
  },
};

module.exports = dadjoke;