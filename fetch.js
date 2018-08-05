/**
 * This is the main code to kick off the data fetching processes, handle their
 * results, saving to a database and repeating the process... forever.
 *
 * There are helpful command line shortcuts, all described with
 * `node index.js --help`.
 */
'use strict';

import {
  getEnv, getArgv
} from './lib/env';

/* eslint-disable import/first */
/** Imports are placed above help so dependencies are loaded after parsing... */

// Dependency imports
import { chain, find } from 'lodash';
import moment from 'moment';

import {
  sendUpdatedWebhook, getMeasurementsObjectFromSource,
  STREAM_END, handleMeasurementErrors, streamDataToS3, forwardErrors
} from './lib/measurement';
import { getDB, streamDataToDB, saveFetches, saveSources } from './lib/db';

import { DataStream } from 'scramjet';

import sources from './sources';
import log from './lib/logger';
import {JetLog} from 'jetlog';

const argv = getArgv();

// Flatten the src into a single array, taking into account src argument
let src = chain(sources).values().flatten().value();

if (argv.source) {
  src = find(src, { name: argv.source });

  // Check here to make sure we have at least one valid source
  if (!src) {
    log.error('I\'m sorry Dave, I searched all known sources and can\'t ' +
      'find anything for', argv.source);
    process.exit(1);
  }

  // Make it a single element array to play nicely downstream
  src = [src];
}

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
var runTasks = async function () {
  log.info('Running all fetch tasks.');
  const {bucketName, apiURL, webhookKey, processTimeout, strict} = getEnv(process.env);
  let itemsInsertedCount = 0;
  const timeStarted = Date.now();

  // This is a top-level safety mechanism, we'll kill this process after a certain
  // time in case it's hanging. Intended to avoid https://github.com/openaq/openaq-fetch/issues/154
  setTimeout(() => {
    log.error('Uh oh, process timed out.');
    const unfinishedSources = Object.entries(runningSources)
      .filter(([, v]) => v !== 'finished' && v !== 'filtered')
      .map(([k]) => k);

    log.error(`Still running sources at time out: ${unfinishedSources}`);
    process.exit(1);
  }, processTimeout);

  strict && process.on('unhandledRejection', e => {
    console.error('Unhandled promise rejection caught:');
    console.error(e.stack);
    process.exit(101);
  });

  /**
   * Generate tasks to run in parallel, only care about the active src
   */
  const runningSources = src.reduce((acc, {name}) => {
    acc[name] = 'initialized';
    return acc;
  }, {});

  const errLog = new JetLog({ read_trace: false });

  errLog
    .map(({msg}) => msg)
    .each(msg => log.warn(msg))
  ;

  DataStream.fromArray(Object.values(sources))
    .flatten()
    .setOptions({maxParallel: 1024})
    .filter(source => {
      if (argv.source && argv.source !== source.name) return false;

      if (source.active) return true;
      runningSources[source.name] = 'filtered';

      log.debug(`Skipping inactive source: ${source.name}`);
      return false;
    })
    .do(source => {
      log.debug(`Starting fetch for ${source.name}`);
      runningSources[source.name] = 'started';
    })
    .map(async (source) => getMeasurementsObjectFromSource(source, argv.dryrun))
    .do(async ({stream}) => {
      if (argv.dryrun) {
        stream.each(m => log.info(m));
      } else {
        const s3 = require('aws-sdk').S3();
        const key = `realtime/${moment().format('YYYY-MM-DD/X')}.ndjson`;

        const pg = getDB();

        await Promise.all([
          streamDataToS3(stream, s3, bucketName, key),
          streamDataToDB(stream, pg)
        ]);

        return stream.whenEnd();
      }
    })
    .do(result => {
      runningSources[result.name] = 'finished';
    })
    .use(forwardErrors)
    .use(handleMeasurementErrors, errLog)
    .map(measurements => {
      const result = measurements.resultsMessage;
      // Add to inserted count if response has a count, if there was a failure
      // response will not have a count
      if (result.count !== undefined) {
        itemsInsertedCount += result.count;
      }
      log.info('///////');
      log.info(result.message);
      for (let [error, count] of Object.entries(result.failures || {})) {
        log.info(`${count} occurrences of ${error}`);
      }
      log.info('///////');
      return result;
    })
    .toArray()
    .then(
      results => argv.dryrun
        ? Promise.all([
          // TODO: saveFetches, saveSources
          saveFetches(timeStarted, Date.now(), itemsInsertedCount, null, results),
          saveSources(sources)
        ])
        : null
    )
    .then(async () => {
      try {
        await sendUpdatedWebhook(apiURL, webhookKey);
        log.info('Webhook posted, have a good day!');
        process.exit(0);
      } catch (err) {
        log.error(err);
        process.exit(100);
      }
    })
    .catch(
      e => {
        if (e === STREAM_END) {
          process.exit(0);
        }
      }
    );
};

// Branch here depending on whether this is a dryrun or not
if (argv.dryrun) {
  log.info('--- Dry run for Testing, nothing is saved to the database. ---');
} else {
  log.info('--- Full fetch created. ---');
}

runTasks();
