'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');

// Register modules exporting name and execute.
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
