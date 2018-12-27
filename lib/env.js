/* eslint no-process-env:0 */

/**
 * @typedef OpenAQEnv
 * @extends Object
 * @param {number} logLevel
 * @param {boolean} logColor
 * @param {string} psqlHost
 * @param {number} psqlPort
 * @param {string} psqlUser
 * @param {string} psqlPassword
 * @param {string} psqlDatabase
 * @param {number} psqlPoolMin
 * @param {number} psqlPoolMax
 * @param {string} apiURL
 * @param {string} webhookKey
 * @param {number} processTimeout
 * @param {string} bucketName
 * @param {number} s3ChunkSize
 * @param {boolean} doSaveToS3
 * @param {boolean} strict
 * @param {boolean} dryrun
 * @param {boolean} debug
 * @param {string} source
 * @param {number} maxParallelAdapters
 */

/**
 * Handles argv
 */
let _argv = require('yargs')
  .usage('Usage: $0 -d -s \'Beijing US Embassy\'')
  .options('quiet', {
    boolean: true,
    describe: 'Show no logging at all',
    alias: 'q',
    group: 'Logging options:'
  })
  .options('important', {
    boolean: true,
    describe: 'Show only warnings and errors.',
    alias: '1',
    group: 'Logging options:'
  })
  .options('verbose', {
    boolean: true,
    describe: 'Show additional logging information (in dry run mode it shows all measurements)',
    alias: 'v',
    group: 'Logging options:'
  })
  .options('debug', {
    boolean: true,
    describe: 'Show lots additional logging information (more than verbose)',
    alias: 'b',
    group: 'Logging options:'
  })
  .options('dryrun', {
    boolean: true,
    describe: 'Run the fetch process but do not attempt to save to the database and instead print to console, useful for testing.',
    alias: 'd',
    group: 'Main options:'
  })
  .options('source', {
    describe: 'Run the fetch process with only the defined source using source name.',
    alias: 's',
    nargs: 1,
    group: 'Main options:'
  })
  .options('strict', {
    boolean: true,
    describe: 'Strict checking - first error will make the process die.',
    alias: 'S',
    group: 'Main options:'
  })
  .help('h')
  .alias('h', 'help')
  .alias('?', 'help')
  .argv;
let _env = process.env;

/**
 * Returns values from argv or env.
 *
 * @returns {OpenAQEnv}
 */
export const getEnv = () => {
  const {
    dryrun,
    debug,
    source,
    important,
    verbose: _verbose,
    quiet: _quiet,
    strict: _strict
  } = _argv;

  const apiURL = _env.API_URL || 'http://localhost:3004/v1/webhooks'; // The url to ping on completion
  const webhookKey = _env.WEBHOOK_KEY || '123'; // Secret key to auth with API
  const processTimeout = _env.PROCESS_TIMEOUT || 10 * 60 * 1000; // Kill the process after a certain time in case it hangs
  const bucketName = _env.AWS_BUCKET_NAME || '';
  const doSaveToS3 = _env.SAVE_TO_S3 === 'true' || +_env.SAVE_TO_S3;
  const strict = _strict || _env.STRICT === 'true' || +_env.STRICT;
  const maxParallelAdapters = +_env.MAX_PARALLEL_ADAPTERS || 1024;
  const s3ChunkSize = +_env.S3_CHUNK_SIZE || 1048576;

  const psqlHost = _env.PSQL_HOST || '127.0.0.1';
  const psqlPort = _env.PSQL_PORT || 5432;
  const psqlUser = _env.PSQL_USER || 'openaq';
  const psqlPassword = _env.PSQL_PASSWORD || 'openaq-pass';
  const psqlDatabase = _env.PSQL_DATABASE || 'openaq-local';
  const psqlPoolMin = +_env.PSQL_POOL_MIN || 2;
  const psqlPoolMax = +_env.PSQL_POOL_MAX || 20;

  const logLevel = _quiet ? 'none'
    : _verbose ? 'verbose'
      : debug ? 'debug'
        : important ? 'warn'
          : _env.LOG_LEVEL || 'info';
  const logColor = _env.LOG_COLOR !== 'false';

  return {
    logLevel,
    logColor,
    psqlHost,
    psqlPort,
    psqlUser,
    psqlPassword,
    psqlDatabase,
    psqlPoolMin,
    psqlPoolMax,
    apiURL,
    webhookKey,
    processTimeout,
    bucketName,
    s3ChunkSize,
    doSaveToS3,
    strict,
    dryrun,
    debug,
    source,
    maxParallelAdapters
  };
};
