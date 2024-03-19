/**
 * This is a module that'll give us access to a Winston-based logging mechanism
 * system-wide. If appropriate, this will also log to Papertrail.
 */
'use strict';

import { createLogger, format, transports } from 'winston';
import * as os from 'os';

const { combine, prettyPrint, simple, splat, colorize } = format;

import _env from './env.js';
const { verbose, logLevel, logColor } = _env();

const logger = createLogger({
    format: combine(
        colorize(),
        simple(),
    ),
    transports: [
        new transports.Console({
            timestamp: true,
            colorize: logColor,
            level: verbose ? 'verbose' : logLevel
        })
    ]
});

export default logger;
