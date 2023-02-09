/**
 * This is the main code to kick off the data fetching processes, handle their
 * results, saving to a database and repeating the process... forever.
 *
 * There are helpful command line shortcuts, all described with
 * `node index.js --help`.
 */
'use strict';
import moment from 'moment';
//import { DataStream } from 'scramjet';
import sj from 'scramjet';
const { DataStream } = sj;

import sources from './sources/index.cjs';
import log from './lib/logger.js';

import _env from './lib/env.js';

//import {
//  getEnv
//} from './lib/env.cjs';

import {
  fetchCorrectedMeasurementsFromSourceStream
} from './lib/measurement.js';

import {
  streamMeasurementsToDBAndStorage
} from './lib/db.js';

import {
  handleProcessTimeout,
  handleUnresolvedPromises,
  handleFetchErrors,
  handleWarnings,
  handleSigInt,
  cleanup
} from './lib/errors.js';

import {
  markSourceAs,
  chooseSourcesBasedOnEnv,
  prepareCompleteResultsMessage
} from './lib/adapters.js';

import {
  reportAndRecordFetch
} from './lib/notification.js';

const env = _env();

const {
  apiURL,
  webhookKey,
  processTimeout,
  maxParallelAdapters,
  strict
} = env;

const runningSources = {};

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
export function handler (event, context) {
  log.debug(event);
  console.log(event);
  // the event may have passed a source, in which case we need to filter
  let current_sources;
  let offset;
  let datetime;
  // if we have have more than one of these running we will need to make
  // sure that we dont overwrite another process
  let suffix = env.suffix || '_na';
  if(event && event.Records && event.Records.length) {
    let messageId = event.Records[0].messageId;
    if(event.Records.length == 1) {
      let body = JSON.parse(event.Records[0].body);
      current_sources = body.sources || body;
      suffix = body.suffix || suffix;
      offset = body.offset;
      datetime = body.datetime;
    } else if(event.Records.length > 1) {
      current_sources = event.Records.map( rcd => {
        let body = JSON.parse(rcd.body);
        offset = body.offset;
        datetime = body.datetime;
        return body.sources || body;
      }).flat();
    }
    suffix = `_${suffix}${messageId}`;
  } else if(event && event.sources) {
    let messageId = 'event';
    current_sources = event.sources;
    offset = event.offset;
    datetime = event.datetime;
    suffix = `_${event.suffix || suffix}${messageId}`;
  } else if(event && event.source) {
    current_sources = sources.filter(d=>d.name == event.source);
  } else if(event && event.adapter) {
    current_sources = sources.filter(d=>d.adapter == event.adapter);
  } else if(env.adapter) {
    current_sources = sources.filter(d=>d.adapter == env.adapter);
  } else {
    current_sources = sources;
  }
  // and the final file name
  env.key = `realtime/${moment().format('YYYY-MM-DD/X')}${suffix}.ndjson`;

  if(offset) {
    env.offset = offset;
  }

  if(datetime) {
    env.datetime = datetime;
  }

  return Promise.race([
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
      return DataStream.fromArray(Object.values(current_sources))
      // flatten the sources
      //  .flatten()
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
      // perform streamed save to S3 on each source.
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
        if(!context) {
          // when used locally
          process.exit(exitCode || 0);
        } else {
          return exitCode;
        }
      }
    );
};
