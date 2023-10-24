/**
 * This is a module that'll give us access to a Winston-based logging mechanism
 * system-wide. If appropriate, this will also log to Papertrail.
 */
'use strict';

import winston from 'winston';

import * as os from 'os';

import _env from './env.js';
const { verbose, logLevel, logColor } = _env();

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      timestamp: true,
      colorize: logColor,
      level: verbose ? 'verbose' : logLevel
    })
  ]
});

export default logger;
