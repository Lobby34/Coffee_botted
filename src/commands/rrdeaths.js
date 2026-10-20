'use strict';

const logger = require('../lib/logger');
const gameState = require('../gameStates/rrGameState');
const deaths = require('../lib/rouletteStore');

const checkDeaths = {
    name: 'rrdeaths',
    description: 'Return the top five persisted roulette death counts.',

    async execute({ client, channel, userstate, audit }) {
        if (gameState.isDeathOnCooldown) {
            audit?.cooldown();
            logger.warn('Attempted to check deaths while on cooldown', { username: userstate.username });
            return;
        }

        gameState.isDeathOnCooldown = true;
        setTimeout(() => { gameState.isDeathOnCooldown = false; }, gameState.COOLDOWN_SECONDS * 500);

        const username = userstate.username;
        logger.info('Deaths Checked', { username });

        const entries = await deaths.leaderboard();
        audit?.set({ leaderboard: entries });

        if (entries.length === 0) {
            await client.say(channel, `The graveyard is EMPTY?? How is this possible?! monkaH`);
            return;
        }

        const leaderboard = entries.map(({ username: user, count }, index) => `${index + 1}. ${user}: ${count} deaths`).join(' | ');

        await client.say(
            channel,
            `Total death leaderboard: ${leaderboard}`
        );
    },
};

module.exports = checkDeaths;