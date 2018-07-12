
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
  const psqlMaxPool = _env.PSQL_POOL_MAX || 10;
  const bucketName = _env.AWS_BUCKET_NAME || '';
  const doSaveToS3 = _env.SAVE_TO_S3 === 'true';
  const strcit = _env.STRICT === 'true';

  return {
    apiURL,
    webhookKey,
    processTimeout,
    psqlMaxPool,
    bucketName,
    doSaveToS3,
    strcit
  };
};

export const getArgv = () => {
  // Set up command line arguments
  return _argv;
};
