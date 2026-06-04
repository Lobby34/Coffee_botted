'use strict';

module.exports = {
    // Timeout variables
    TIMEOUT_SECONDS: 10,
    TIMEOUT_REASON: 'xdd You shoot youself, what did you expect!?',

    // Roulette variables
    CHAMBERS: 6,
    currentChambers: 6,

    //Cooldown variables
    isOnCooldown: false,
    COOLDOWN_SECONDS: 10,
    isDeathOnCooldown: false,

    // Stat tracking variables
    deathCounts: {},
}