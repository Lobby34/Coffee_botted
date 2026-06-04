'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');
const gameState = require('../gameStates/dadjokeGameState');

const dadjoke = {
  name: 'dadjoke',
  description: `Tells a random dad joke from the joke book!`,

  async execute({ client, channel, userstate }) {
    // 1. Check local cooldown to prevent chat spam
    if (gameState.isOnCooldown) {
      return; 
    }

    gameState.isOnCooldown = true;
    setTimeout(() => {
      gameState.isOnCooldown = false;
    }, gameState.COOLDOWN_SECONDS * 1000);

    try {
      // Locate joke file
      const filePath = path.join(__dirname, '../data/jokes.txt');

      // Live read file (may hinder performance)
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Split by '\n'
      const jokes = fileContent
        .split('\n')
        .map(joke => joke.trim())
        .filter(joke => joke.length > 0);

      // EMPY FILE HANDLING
      if (jokes.length === 0) {
        await client.say(channel, "I'm out of jokes! Please add some to data/jokes.txt");
        return;
      }

      const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];

      // MESSAGE HANDLING
      await client.say(channel, randomJoke);
      logger.info('Told a dad joke', { user: userstate.username });

    } catch (err) {
      logger.error('Failed to read dad jokes file', { err: err.message });
      await client.say(channel, "My joke book is stuck closed right now! Sadge");
    }
  },
};

module.exports = dadjoke;