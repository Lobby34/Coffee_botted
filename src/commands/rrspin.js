'use strict';

const logger = require('../lib/logger');
const gameState = require('../gameStates/rrGameState');

const spinChambers = {
    name: 'rrspin',
    description: `Spin the chambers and reset the game!`,

    async execute({ client, channel, userstate, audit }) {
        if (gameState.isOnCooldown) {
            audit?.cooldown();
            logger.warn('Attempted to spin while on cooldown', { username: userstate.username });
            return;
        }

        gameState.isOnCooldown = true;
        setTimeout(() => {
            gameState.isOnCooldown = false;
        }, gameState.COOLDOWN_SECONDS * 1000);

        const username = userstate.username;
        const displayName = userstate['display-name'] || username;

        audit?.set({ chambers_before: gameState.currentChambers, chambers_remaining: gameState.CHAMBERS });
        gameState.currentChambers = gameState.CHAMBERS;

        logger.info('Chambers spun', { username });

        await client.say(
            channel,
            `@${displayName} spun the barrel! The game has been reset.`
        );
    },
};

module.exports = spinChambers;