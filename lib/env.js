
let _argv = require('yargs')
  .usage('Usage: $0 --dryrun --source \'Beijing US Embassy\'')
  .boolean('dryrun')
  .describe('dryrun', 'Run the fetch process but do not attempt to save to the database and instead print to console, useful for testing.')
  .alias('d', 'dryrun')
  .describe('source', 'Run the fetch process with only the defined source using source name.')
  .alias('s', 'source')
  .nargs('source', 1)
  .help('h')
  .alias('h', 'help')
  .argv;
let _env = process.env;

export const getEnv = () => {
  const apiURL = _env.API_URL || 'http://localhost:3004/v1/webhooks'; // The url to ping on completion
  const webhookKey = _env.WEBHOOK_KEY || '123'; // Secret key to auth with API
  const processTimeout = _env.PROCESS_TIMEOUT || 10 * 60 * 1000; // Kill the process after a certain time in case it hangs
  const bucketName = _env.AWS_BUCKET_NAME || '';
  const doSaveToS3 = _env.SAVE_TO_S3 === 'true';
  const strict = _env.STRICT === 'true';
  const maxParallelAdapters = +_env.MAX_PARALLEL_ADAPTERS || 1024;

  const psqlHost = _env.PSQL_HOST || '192.168.99.100';
  const psqlPort = _env.PSQL_PORT || 5432;
  const psqlUser = _env.PSQL_USER || 'openaq';
  const psqlPassword = _env.PSQL_PASSWORD || 'openaq-pass';
  const psqlDatabase = _env.PSQL_DATABASE || 'openaq-local';
  const psqlPoolMin = _env.PSQL_POOL_MIN || 2;
  const psqlPoolMax = _env.PSQL_POOL_MAX || 20;

  const logLevel = _env.LOG_LEVEL || 'info';
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
    doSaveToS3,
    strict,
    maxParallelAdapters
  };
};

export const getArgv = () => {
  // Set up command line arguments
  return _argv;
};
