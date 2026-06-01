'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');

/**
 * Scans this directory for command modules and returns a Map of
 * commandName → commandModule.
 *
 * To add a new command, just drop a .js file in src/commands/ that exports:
 *   {
 *     name: 'commandname',       // what users type after the prefix
 *     description: 'What it does',
 *     execute: async ({ client, channel, userstate, args }) => { ... }
 *   }
 *
 */
function loadCommands() {
  const commands = new Map();
  const commandsDir = __dirname;

  const files = fs
    .readdirSync(commandsDir)
    .filter((f) => f.endsWith('.js') && f !== 'index.js');

  for (const file of files) {
    const command = require(path.join(commandsDir, file));

    if (!command.name || typeof command.execute !== 'function') {
      logger.warn(`Skipping invalid command file: ${file} (missing name or execute)`);
      continue;
    }

    commands.set(command.name.toLowerCase(), command);
    logger.info(`Loaded command: ${command.name}`);
  }

  return commands;
}

module.exports = { loadCommands };
