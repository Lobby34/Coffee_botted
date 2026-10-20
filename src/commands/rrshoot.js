'use strict';

const logger = require('../lib/logger');
const gameState = require('../gameStates/rrGameState');
const deaths = require('../lib/rouletteStore');
// Roll remaining chambers; persist deaths before dispatching loss effects.
const rrshoot = {
  name: 'rrshoot',
  description: 'Roll a chamber and timeout the losing target.',

  async execute({ client, channel, userstate, args, audit }) {

    if (gameState.isOnCooldown) {
      audit?.cooldown();
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

    const chambersBefore = gameState.currentChambers;
    const roll = Math.floor(Math.random() * gameState.currentChambers) + 1;
    const lost = roll === 1;

    gameState.currentChambers--;
    audit?.set({
      target: targetUsername, roll, lost,
      total_chambers: gameState.CHAMBERS, chambers_before: chambersBefore,
      chambers_remaining: gameState.currentChambers,
      next_chambers: lost ? gameState.CHAMBERS : gameState.currentChambers,
      timeout_seconds: lost ? gameState.TIMEOUT_SECONDS : 0,
    });

    logger.info('Gun shooted', { targetUsername, roll, lost });

    if (lost) {
      gameState.currentChambers = gameState.CHAMBERS;
      const deathCount = await deaths.increment(targetUsername);
      audit?.set({ death_count: deathCount });
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

      try {
        await client.timeout(channel, targetUsername, gameState.TIMEOUT_SECONDS, gameState.TIMEOUT_REASON);
      } catch (err) {
        audit?.error(err);
        logger.error('Failed to timeout user — is the bot a mod?', { targetUsername, err: err.message });
        await client.say(channel, `Even legends such as @${targetDisplayName} can't escape their fate!.`);
      }
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
