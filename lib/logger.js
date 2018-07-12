/**
 * This is a module that'll give us access to a Winston-based logging mechanism
 * system-wide. If appropriate, this will also log to Papertrail.
 */
'use strict';

var winston = require('winston/lib/winston');
require('winston-papertrail/lib/winston-papertrail').Papertrail; // eslint-disable-line no-unused-expressions
var os = require('os');

var logLevel = process.env.LOG_LEVEL || 'info';

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      timestamp: () => new Date().toISOString(),
      colorize: true,
      level: logLevel
    })
  ]
});

// Add Papertrail logger if we have credentials
if (process.env.PAPERTRAIL_URL) {
  logger.add(winston.transports.Papertrail, {
    host: process.env.PAPERTRAIL_URL,
    port: process.env.PAPERTRAIL_PORT,
    hostname: process.env.PAPERTRAIL_HOSTNAME,
    colorize: true,
    program: os.hostname(),
    level: logLevel
  });
}

module.exports = logger;
