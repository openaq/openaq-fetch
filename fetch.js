/**
 * This is the main code to kick off the data fetching processes, handle their
 * results, saving to a database and repeating the process... forever.
 *
 * There are helpful command line shortcuts, all described with
 * `node index.js --help`.
 */
'use strict';

import { DataStream } from 'scramjet';

import { getEnv } from './lib/env';
import { getCorrectedMeasurementsFromSource } from './lib/measurement';
import { streamMeasurementsToDBAndStorage } from './lib/db';
import { handleProcessTimeout, handleUnresolvedPromises, handleFetchErrors, handleWarnings, forwardErrors } from './lib/errors';
import { markSourceAs, chooseSourcesBasedOnEnv, prepareCompleteResultsMessage, reportAndRecordFetch } from './lib/adapters';

import sources from './sources';
import log from './lib/logger';

const env = getEnv();
const { bucketName, apiURL, webhookKey, processTimeout, doSaveToS3, maxParallelAdapters, strict } = env;

const runningSources = {};

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
Promise.race([
  handleProcessTimeout(processTimeout, runningSources),
  handleUnresolvedPromises(strict),
  handleWarnings(['MaxListenersExceededWarning'], strict),
  (async function () {
    if (env.dryrun) {
      log.info('--- Dry run for Testing, nothing is saved to the database. ---');
    } else {
      log.info('--- Full fetch started. ---');
    }

    const fetchReport = {
      itemsInserted: 0,
      timeStarted: Date.now(),
      results: null,
      errors: null,
      timeEnded: NaN
    };

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
      .map(source => getCorrectedMeasurementsFromSource(source, env))
      // perform streamed save to DB and S3 on each source.
      .do(streamMeasurementsToDBAndStorage(doSaveToS3, env, bucketName))
      // mark sources as finished
      .do(markSourceAs('finished', runningSources))
      // handle adapter errors to be forwarded to main stream and well handled.
      .use(forwardErrors, env)
      // convert to measurement report format for storage
      .map(prepareCompleteResultsMessage(fetchReport))
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
    exitCode => process.exit(exitCode || 0)
  )
;
