/* eslint no-process-env:0 */
import { readFileSync } from 'fs';
import _yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
const yargs = _yargs(hideBin(process.argv));

/**
 * @typedef OpenAQEnv
 * @extends Object
 * @param {number} logLevel
 * @param {boolean} logColor
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
 * @param {string} adapter
 * @param {number} maxParallelAdapters
 */

/**
 * Handles argv
 */

const _argv = yargs
  .usage("Usage: $0 -d -s 'Beijing US Embassy'")
  .options('quiet', {
    boolean: true,
    describe: 'Show no logging at all',
    alias: 'q',
    group: 'Logging options:'
  })
  .options('important', {
    boolean: true,
    describe: 'Show only warnings and errors.',
    alias: 'i',
    group: 'Logging options:'
  })
  .options('verbose', {
    boolean: true,
    describe:
      'Show additional logging information (in dry run mode it shows all measurements)',
    alias: 'v',
    group: 'Logging options:'
  })
  .options('debug', {
    boolean: true,
    describe:
      'Show lots additional logging information (more than verbose)',
    alias: 'b',
    group: 'Logging options:'
  })
  .options('dryrun', {
    boolean: true,
    describe:
      'Run the fetch process but do not attempt to save to the database and instead print to console, useful for testing.',
    alias: 'd',
    group: 'Main options:'
  })
  .options('source', {
    describe:
      'Run the fetch process with only the defined source using source name.',
    alias: 's',
    nargs: 1,
    group: 'Main options:'
  })
  .options('adapter', {
    describe:
      'Run the fetch process with only the defined adapter in the source list',
    alias: 'a',
    nargs: 1,
    group: 'Main options:'
  })
  .options('strict', {
    boolean: true,
    describe:
      'Strict checking - first error will make the process die.',
    alias: 'S',
    group: 'Main options:'
  })
  .options('env', {
    describe: 'Use local env file - provide relative path to file',
    alias: 'e',
    group: 'Main options:'
  })
  .options('deployments', {
    describe: 'Use the scheduler to pass deployment events to the fetcher. Specify all or a deployment name',
    alias: 'D',
    group: 'Testing options:'
  })
  .options('nofetch', {
    boolean: false,
    describe: 'Skip the actual fetch process',
    alias: 'n',
    group: 'Testing options:'
  })
  .options('datetime', {
    describe: 'The date/time to query for, if the adapter handles it',
    alias: 't',
    group: 'Main options:'
  })
  .options('offset', {
    describe:
      'The number of hours back from the current time to search for',
    alias: 'o',
    group: 'Main options:'
  })
  .help('h')
  .alias('h', 'help')
  .alias('?', 'help').argv;

const _env = process.env;

/**
 * Read values from local file and add them to the global _env
 * this is to help with local testing
 */
export const readEnvFromLocalFile = (envFile) => {
  const envs = readFileSync(envFile, 'utf8');
  envs.split('\n').forEach(function (e) {
    if (e) {
      const idx = e.indexOf('=');
      const name = e.substring(0, idx);
      const value = e.substring(idx + 1, e.length);
      if (!_env[name]) {
        _env[name] = value;
      }
    }
  });
};

/**
 * Returns values from argv or env.
 *
 * @returns {OpenAQEnv}
 */
export default () => {
  let {
    dryrun,
    deployments,
    nofetch,
    debug,
    source,
    adapter,
    important,
    datetime,
    offset,
    verbose: _verbose,
    quiet: _quiet,
    strict: _strict
  } = _argv;

  if (_argv.env) {
    readEnvFromLocalFile(_argv.env);
  }
  if (!source && _env.SOURCE) {
    source = _env.SOURCE;
  }
  if (!adapter && _env.ADAPTER) {
    adapter = _env.ADAPTER;
  }

  const apiURL = _env.API_URL || 'http://localhost:3004/v1/webhooks'; // The url to ping on completion
  const webhookKey = _env.WEBHOOK_KEY || '123'; // Secret key to auth with API
  const processTimeout = _env.PROCESS_TIMEOUT || 9.5 * 60 * 1000; // Kill the process after a certain time in case it hangs
  const bucketName = _env.AWS_BUCKET_NAME || '';
  const doSaveToS3 = _env.SAVE_TO_S3 === 'true' || +_env.SAVE_TO_S3;
  const strict = _strict || _env.STRICT === 'true' || +_env.STRICT;
  const maxParallelAdapters = +_env.MAX_PARALLEL_ADAPTERS || 1024;
  const s3ChunkSize = +_env.S3_CHUNK_SIZE || 1048576;

  const suffix = _env.SUFFIX || '';

  offset = +(offset || _env.OFFSET);

  const logLevel = _quiet
    ? 'none'
    : _verbose
      ? 'verbose'
      : debug
        ? 'debug'
        : important
          ? 'warn'
          : _env.LOG_LEVEL || 'info';
  const logColor = _env.LOG_COLOR !== 'false';

  return {
    logLevel,
    logColor,
    apiURL,
    webhookKey,
    processTimeout,
    bucketName,
    s3ChunkSize,
    doSaveToS3,
    strict,
    dryrun,
    deployments,
    nofetch,
    debug,
    source,
    datetime,
    offset,
    suffix,
    adapter,
    maxParallelAdapters
  };
};
