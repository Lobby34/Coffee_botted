'use strict';

const logger = require('../lib/logger');
const gameState = require('../gameStates/rrGameState');

const checkDeaths = {
    name: 'rrdeaths',
    description: `Check the global death count!`,

    async execute({ client, channel, userstate }) {
        if (gameState.isDeathOnCooldown) {
            logger.warn('Attempted to check deaths while on cooldown', { username: userstate.username });
            return;
        }

        gameState.isDeathOnCooldown = true;
        setTimeout(() => { gameState.isDeathOnCooldown = false; }, gameState.COOLDOWN_SECONDS * 500);

        const username = userstate.username;
        logger.info('Deaths Checked', { username });

        const entries = Object.entries(gameState.deathCounts);

        // Handle no deaths scenario
        if (entries.length === 0) {
            await client.say(channel, `The graveyard is EMPTY?? How is this possible?! monkaH`);
            return;
        }

        const leaderboard = entries.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([user, count], index) => `${index + 1}. ${user}: ${count} deaths`).join('\n');

        await client.say(
            channel,
            `Total death leaderboard:'\n' ${leaderboard}`
        );
    },
};

module.exports = checkDeaths;