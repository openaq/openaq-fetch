'use strict';

var winston = require('winston');
require('winston-papertrail').Papertrail;
var os = require('os');

var logLevel = process.env.LOG_LEVEL || 'info';

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      timestamp: function () {
        return new Date().toISOString();
      },
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
