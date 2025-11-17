/**
 * This is the main code to kick off the data fetching processes, handle their
 * results, saving to a database and repeating the process... forever.
 *
 * There are helpful command line shortcuts, all described with
 * `node index.js --help`.
 */

import { fetchCorrectedMeasurementsFromSourceStream } from './lib/measurement.js';
import { streamMeasurementsToDBAndStorage } from './lib/db.js';
import { sourcesArray } from './sources/index.js';
import log from './lib/logger.js';
import _env from './lib/env.js';

import { DateTime } from 'luxon';
import sj from 'scramjet';

import {
  handleProcessTimeout,
  handleUnresolvedPromises,
  handleFetchErrors,
  handleWarnings,
  handleSigInt,
  cleanup,
} from './lib/errors.js';

import {
  markSourceAs,
  chooseSourcesBasedOnEnv,
  prepareCompleteResultsMessage,
} from './lib/adapters.js';

import { reportAndRecordFetch } from './lib/notification.js';

const { DataStream } = sj;

const env = _env();

const {
  processTimeout,
  maxParallelAdapters,
  strict,
} = env;

const runningSources = {};

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
export function handler (event, context) {
  // the event may have passed a source, in which case we need to filter
  let currentSources;
  let offset;
  let datetime;
  // if we have have more than one of these running we will need to make
  // sure that we dont overwrite another process
  let suffix = env.suffix || '_na';
  if (event && event.Records && event.Records.length) {
		log.info(`Getting sources from event data - ${event.Records && event.Records.length} records`);
    const messageId = event.Records[0].messageId;
    if (event.Records.length === 1) {
      const body = typeof(event.Records[0].body) === 'string'
						? JSON.parse(event.Records[0].body)
						: event.Records[0].body;
      currentSources = body.sources || body;
      suffix = body.suffix || suffix;
      offset = body.offset;
      datetime = body.datetime;
    } else if (event.Records.length > 1) {
      currentSources = event.Records.map((rcd) => {
        const body = JSON.parse(rcd.body);
        offset = body.offset;
        datetime = body.datetime;
        return body.sources || body;
      }).flat();
    }
    suffix = `_${suffix}${messageId}`;
  } else if (event && event.sources) {
		log.info(`Getting sources from event sources - ${event.sources && event.sources.length} sources`);
    const messageId = 'event';
    currentSources = event.sources;
    offset = event.offset;
    datetime = event.datetime;
    suffix = `_${event.suffix || suffix}${messageId}`;
  } else if (event && event.source) {
    log.info(`Getting source from event source`);
    currentSources = sourcesArray.filter(
      (d) => d.name === event.source
    );

  } else if (event && event.adapter) {
    log.info(`Getting sources from event adapter ${event.adapter}`);
    currentSources = sourcesArray.filter(
      (d) => d.adapter === event.adapter
    );
  } else if (env.adapter) {
    log.info(`Getting sources from env variable adapter ${env.adapter}`);
    currentSources = sourcesArray.filter(
      (d) => d.adapter === env.adapter
    );
  } else if (env.source) {
    log.info(`Getting source from env variable source ${env.source}`);
    currentSources = sourcesArray.filter(
				(d) => d.name === env.source
    );
  } else {
    log.info(`Getting sources from active sources array`);
    currentSources = sourcesArray.filter(s => s.active);
  }
  // and the final file name
  env.key = `realtime/${DateTime.now().toFormat('yyyy-MM-dd/X')}${suffix}.ndjson`;

  if (offset) {
    env.offset = offset;
  }

  if (datetime) {
    env.datetime = datetime;
  }

	currentSources.map(s => console.log(`-- ${s.adapter}/${s.name}`));

  if (env.nofetch) {
	  log.info(`Skipping fetch for ${currentSources.length} sources and saving to ${env.key}`);
	  return true;
  }

  const fetchReport = {
    itemsInserted: 0,
    timeStarted: Date.now(),
    results: {}, // placeholder for the results
    errors: null,
    timeEnded: NaN,
  };

  return Promise.race([
    handleSigInt(runningSources, fetchReport, env),
    handleProcessTimeout(processTimeout, runningSources, fetchReport, env),
    handleUnresolvedPromises(strict),
    handleWarnings(['MaxListenersExceededWarning'], strict),
    (async function () {
      if (env.dryrun) {
        log.info(
          '--- Dry run for Testing, nothing is saved to the database. ---'
        );
      } else {
        log.info('--- Full fetch started. ---');
      }

        log.info(
          `--- Running with ${maxParallelAdapters} parallel adapters ---`
        );

      // create a DataStream from sources
      return (
        DataStream.fromArray(Object.values(currentSources))
          // flatten the sources
          //  .flatten()
          // set parallel limits
          .setOptions({ maxParallel: maxParallelAdapters })
          // filter sources - if env is set then choose only matching source,
          //   otherwise filter out inactive sources.
          // * inactive sources will be run if called by name in env.
          //.use(chooseSourcesBasedOnEnv, env, runningSources)
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
            reportAndRecordFetch(
              fetchReport,
              sourcesArray,
              env,
            )
          )
      );
    })(),
  ])
    .catch(handleFetchErrors(log, env))
    .then(async (exitCode) => {
      await cleanup();
      if (!context) {
        // when used locally
        process.exit(exitCode || 0);
      } else {
        return exitCode;
      }
    });
}
