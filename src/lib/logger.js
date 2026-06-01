'use strict';

const { createLogger, format, transports } = require('winston');
const config = require('../config');

const { combine, timestamp, printf, colorize, errors } = format;

// Human-readable format for development
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    let line = `${timestamp} [${level}] ${message}`;
    if (stack) line += `\n${stack}`;
    const extras = Object.keys(meta);
    if (extras.length) line += ` ${JSON.stringify(meta)}`;
    return line;
  })
);

// Structured JSON format production ready
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: 'info',
  format: config.app.isDev ? devFormat : prodFormat,
  transports: [new transports.Console()],
});

module.exports = logger;
