/**
 * This is the main code to kick off the data fetching processes, handle their
 * results, saving to a database and repeating the process... forever.
 *
 * There are helpful command line shortcuts, all described with
 * `node index.js --help`.
 */
'use strict';

import { DataStream } from 'scramjet';

import sources from './sources';
import log from './lib/logger';

import { getEnv } from './lib/env';
import { fetchCorrectedMeasurementsFromSourceStream } from './lib/measurement';
import { streamMeasurementsToDBAndStorage } from './lib/db';
import { handleProcessTimeout, handleUnresolvedPromises, handleFetchErrors, handleWarnings, handleSigInt, cleanup } from './lib/errors';
import { markSourceAs, chooseSourcesBasedOnEnv, prepareCompleteResultsMessage } from './lib/adapters';
import { reportAndRecordFetch } from './lib/notification';

const AWS = require('aws-sdk');
var stepfunctions = new AWS.StepFunctions();

const env = getEnv();
const { apiURL, webhookKey, processTimeout, maxParallelAdapters, strict } = env;

const runningSources = {};

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
exports.lambdaHandler = (sourceName, context, callback) => {
  console.log(sourceName);
  // Make sure we have a source name
  // let input = event.Input;
  if (!sourceName) {
    return callback(null, { status: 'failure', reason: 'NO_SOURCE_NAME' });
  }
  env.source = sourceName;
  const fetchReport = {
    itemsInserted: 0,
    timeStarted: Date.now(),
    results: null,
    errors: null,
    timeEnded: NaN
  };
  Promise.race([
    handleSigInt(runningSources),
    // handleProcessTimeout(processTimeout, runningSources),
    handleUnresolvedPromises(strict),
    handleWarnings(['MaxListenersExceededWarning'], strict),
    (async function () {
      if (env.dryrun) {
        log.info('--- Dry run for Testing, nothing is saved to the database. ---');
      } else {
        log.info('--- Full fetch started. ---');
      }

      // create a DataStream from sources
      return DataStream.fromArray(Object.values(sources))
        // flatten the sources
        .flatten()
        // set parallel limits
        .setOptions({maxParallel: maxParallelAdapters})
        // filter sources - if env is set then choose only matching source,
        //   otherwise filter out inactive sources.
        // * inactive sources will be run if called by name in env.
        .use(chooseSourcesBasedOnEnv, env, runningSources)
        // mark sources as started
        .do(markSourceAs('started', runningSources))
        // get measurements object from given source
        // all error handling should happen inside this call
        .use(fetchCorrectedMeasurementsFromSourceStream, env)
        // perform streamed save to DB and S3 on each source.
        .use(streamMeasurementsToDBAndStorage, env)
        // mark sources as finished
        .do(markSourceAs('finished', runningSources))
        // convert to measurement report format for storage
        .use(prepareCompleteResultsMessage, fetchReport, env)
        // aggregate to Array
        .toArray()
        // save fetch log to DB and send a webhook if necessary.
        .then(
          reportAndRecordFetch(fetchReport, sources, env, apiURL, webhookKey)
        );
    })()
  ])
    .catch(
      handleFetchErrors(log, env)
    )
    .then(
      async exitCode => {
        await cleanup();
        // process.exit(exitCode || 0);
        return callback(null, { status: 'success', results: fetchReport });
      }
    );
};

exports.runStepFunction = (event, context, callback) => {
  // Get all the active sources
  const activeSources = [];
  Object.values(sources).forEach((country) => {
    country.forEach((source) => {
      if (source.active) {
        activeSources.push(source.name);
      }
    });
  });
  // const inputData = {
  //   sourceNames: activeSources.slice(0,20)
  // };
  const inputData = {
    sourceNames: activeSources
  };

  // Run the Step Function
  const params = {
    stateMachineArn: process.env.STEP_FUNCTION_ARN,
    input: JSON.stringify(inputData)
  };
  stepfunctions.startExecution(params, (err, data) => {
    if (err) {
      console.error(err, err.stack);
    }
    console.log(data);
    return callback(err, { statusCode: 200, body: {status: '👍'} });
  });
};