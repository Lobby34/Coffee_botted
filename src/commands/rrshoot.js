'use strict';

const logger = require('../lib/logger');
const gameState = require('../gameStates/rrGameState');
/**
 * !rrshoot [optional: @username] - Take your chances with Russian Roulette. 
 * The user takes their chances. 1 in CHAMBERS to get timed out for TIMEOUT_SECONDS seconds.
 */
const rrshoot = {
  name: 'rrshoot',
  description: `Take your chances — 1 in ${gameState.CHAMBERS} to get timed out for ${gameState.TIMEOUT_SECONDS} seconds!`,

  async execute({ client, channel, userstate, args }) {

    if (gameState.isOnCooldown) {
      logger.warn('Attempted to shoot while on cooldown', { username: userstate.username });
      return;
    }

    gameState.isOnCooldown = true;
    setTimeout(() => {
      gameState.isOnCooldown = false;
    }, gameState.COOLDOWN_SECONDS * 1000);

    const shooterName = userstate.username;
    const shooterDisplayName = userstate['display-name'] || shooterName;

    let targetUsername = shooterName;
    let targetDisplayName = shooterDisplayName;
    let shooterIsTarget = true;

    if (args && args.length > 0) {
      targetUsername = args[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      targetDisplayName = targetUsername;
      shooterIsTarget = false;
    }

    const roll = Math.floor(Math.random() * gameState.currentChambers) + 1;
    const lost = roll === 1;

    gameState.currentChambers--;

    logger.info('Gun shooted', { targetUsername, roll, lost });

    // LOSS HANDLING
    if (lost) {
      gameState.currentChambers = gameState.CHAMBERS
      if (!shooterIsTarget) {
        await client.say(
          channel,
          `@${shooterDisplayName} points the revolver at @${targetDisplayName} and pulls the trigger... monkaH The trigger is pulled. A bullet fired. F for ${targetDisplayName} HAH  GAMBAADDICT LMAO`,
        );
      } else {
        await client.say(
          channel,
          `@${targetDisplayName} pulls the trigger of the revolver... monkaH The trigger is pulled. A bullet fired. F for ${targetDisplayName} HAH  GAMBAADDICT LMAO`,
        );
      }

    // DEATH COUNT HANDLING
      if (!gameState.deathCounts[targetUsername]) {
        gameState.deathCounts[targetUsername] = 0;
      }
      gameState.deathCounts[targetUsername]++;


    // TIMEOUT HANDLING
      try {
        await client.timeout(channel, targetUsername, gameState.TIMEOUT_SECONDS, gameState.TIMEOUT_REASON);
      } catch (err) {
        // This can happen if the bot isn't a mod in the channel
        logger.error('Failed to timeout user — is the bot a mod?', { targetUsername, err: err.message });
        await client.say(channel, `Even legends such as @${targetDisplayName} can't escape their fate!.`);
      }
    // WIN HANDLING
    } else {
      if (!shooterIsTarget) {
        await client.say(
          channel,
          `@${shooterDisplayName} points the revolver at @${targetDisplayName} and pulls the trigger... monkaH The trigger is pulled. AND ${targetDisplayName} SURVIVES PogChamp xddConga LETSGOOO LETSGO  ${gameState.currentChambers} chambers left. Who will be the next victim? monkaH`
        );
      } else {
        await client.say(
          channel,
          `@${targetDisplayName} pulls the trigger of the revolver... monkaH The trigger is pulled. AND SURVIVES PogChamp xddConga LETSGOOO LETSGO  ${gameState.currentChambers} chambers left. Who will be the next victim? monkaH`
        );
      }
    }
  },
};

module.exports = rrshoot;
