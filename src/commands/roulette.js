'use strict';

const logger = require('../lib/logger');

// How many sides the revolver (1 in CHAMBERS to lose)
const CHAMBERS = 6;

// Time in seconds the user gets timed out if they lose
const TIMEOUT_SECONDS = 10;

// Timeout reason in Twitch log
const TIMEOUT_REASON = 'xdd You shoot youself, what did you expect!?';

/**
 * !roulette
 *
 * The user takes their chances. 1 in CHAMBERS to get timed out for TIMEOUT_SECONDS seconds.
 */
const roulette = {
  name: 'roulette',
  description: `Take your chances — 1 in ${CHAMBERS} to get timed out for ${TIMEOUT_SECONDS} seconds!`,

  async execute({ client, channel, userstate }) {
    const username = userstate.username;
    const displayName = userstate['display-name'] || username;
    const isMod = userstate.mod;
    const isBroadcaster = userstate.badges?.broadcaster === '1';

    const roll = Math.floor(Math.random() * CHAMBERS) + 1;
    const lost = roll === 1;

    logger.info('Gun shooted', { username, roll, lost });

    if (lost) {
      await client.say(
        channel,
        `@${displayName} shooted themselves. Better luck next time! xdd`
      );

      try {
        await client.timeout(channel, username, TIMEOUT_SECONDS, TIMEOUT_REASON);
      } catch (err) {
        // This can happen if the bot isn't a mod in the channel
        logger.error('Failed to timeout user — is the bot a mod?', { username, err: err.message });
        await client.say(channel, `Couldnt timeout @${displayName}. Make sure the bot is a mod in the channel!`);
      }
    } else {
      await client.say(
        channel,
        `@${displayName} pulled the trigger and they survived`
      );
    }
  },
};

module.exports = roulette;
