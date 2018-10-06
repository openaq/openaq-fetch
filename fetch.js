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

const env = getEnv();
const { apiURL, webhookKey, processTimeout, maxParallelAdapters, strict } = env;

const runningSources = {};

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
Promise.race([
  handleSigInt(runningSources),
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
      process.exit(exitCode || 0);
    }
  )
;
