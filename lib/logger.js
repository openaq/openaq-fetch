/**
 * This is a module that'll give us access to a Winston-based logging mechanism
 * system-wide. If appropriate, this will also log to Papertrail.
 */
'use strict';

const winston = require('winston/lib/winston');
require('winston-papertrail/lib/winston-papertrail').Papertrail; // eslint-disable-line no-unused-expressions
const os = require('os');

const { verbose, logLevel, logColor } = require('./env').getEnv();

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      timestamp: () => new Date().toISOString(),
      colorize: logColor,
      level: verbose ? 'verbose' : logLevel
    })
  ]
});

// Add Papertrail logger if we have credentials
if (process.env.PAPERTRAIL_URL) {
  logger.add(winston.transports.Papertrail, {
    host: process.env.PAPERTRAIL_URL,
    port: process.env.PAPERTRAIL_PORT,
    hostname: process.env.PAPERTRAIL_HOSTNAME,
    colorize: logColor,
    program: os.hostname(),
    level: logLevel
  });
}

module.exports = logger;
