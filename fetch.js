/**
 * This is the main code to kick off the data fetching processes, handle their
 * results, saving to a database and repeating the process... forever.
 *
 * There are helpful command line shortcuts, all described with
 * `node index.js --help`.
 */
'use strict';

import { DataStream } from 'scramjet';

import { getEnv, getArgv } from './lib/env';
import { getMeasurementsFromSource, forwardErrors } from './lib/measurement';
import { streamMeasurementsToDBAndStorage } from './lib/db';
import { handleProcessTimeout, handleUnresolvedPromises, handleFetchErrors, handleWarnings } from './lib/utils';
import { markSourceAs, chooseSourcesBasedOnArgv, prepareCompleteResultsMessage, reportAndRecordFetch } from './lib/adapters';

import sources from './sources';
import log from './lib/logger';

const argv = getArgv();
const { bucketName, apiURL, webhookKey, processTimeout, doSaveToS3, maxParallelAdapters, strict } = getEnv();

const runningSources = {};

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
Promise.race([
  handleProcessTimeout(processTimeout, runningSources),
  handleUnresolvedPromises(strict),
  handleWarnings(['MaxListenersExceededWarning'], strict),
  (async function () {
    if (argv.dryrun) {
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

    return DataStream
      // create a DataStream from sources
      .fromArray(Object.values(sources))
      // flatten the sources
      .flatten()
      // set parallel limits
      .setOptions({maxParallel: maxParallelAdapters})
      // filter sources - if argv is set then choose only matching source,
      //   otherwise filter out inactive sources.
      // * inactive sources will be run if called by name in argv.
      .use(chooseSourcesBasedOnArgv, argv, runningSources)
      // mark sources as started
      .do(markSourceAs('started', runningSources))
      // get measurements object from given source
      .map(async (source) => getMeasurementsFromSource(source, argv))
      // perform streamed save to DB and S3 on each source.
      .do(streamMeasurementsToDBAndStorage(doSaveToS3, argv, bucketName))
      // mark sources as finished
      .do(markSourceAs('finished', runningSources))
      // handle adapter errors to be forwarded to main stream and well handled.
      .use(forwardErrors)
      // convert to measurement report format for storage
      .map(prepareCompleteResultsMessage(fetchReport))
      // aggregate to Array
      .toArray()
      // save fetch log to DB and send a webhook if necessary.
      .then(
        // TODO: filter out sources not included in fetch
        reportAndRecordFetch(fetchReport, sources, argv, apiURL, webhookKey)
      );
  })()
])
  .catch(
    handleFetchErrors(log, argv)
  )
  .then(
    exitCode => process.exit(exitCode || 0)
  )
;
