/**
 * This is the main code to kick off the data fetching processes, handle their
 * results, saving to a database and repeating the process... forever.
 *
 * There are helpful command line shortcuts, all described with
 * `node index.js --help`.
 */
'use strict';

import { getEnv, getArgv } from './lib/env';

/* eslint-disable import/first */
/** Imports are placed above help so dependencies are loaded after parsing... */

// Dependency imports
import moment from 'moment';

import { sendUpdatedWebhook, getMeasurementsFromSource, streamDataToS3, forwardErrors } from './lib/measurement';
import { FetchError, STREAM_END } from './lib/errors';
import { getDB, streamDataToDB, saveFetches, saveSources } from './lib/db';

import { DataStream } from 'scramjet';

import sources from './sources';
import log from './lib/logger';
import {JetLog} from 'jetlog';

const argv = getArgv();

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
Promise.race([
  (async function () {
    // Branch here depending on whether this is a dryrun or not
    if (argv.dryrun) {
      log.info('--- Dry run for Testing, nothing is saved to the database. ---');
    } else {
      log.info('--- Full fetch started. ---');
    }

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
    const runningSources = {};

    const errLog = new JetLog({ read_trace: false });

    errLog
      .map(({msg}) => msg)
      .each(msg => log.warn(msg))
    ;

    DataStream.fromArray(Object.values(sources))
      .flatten()
      .setOptions({maxParallel: 1024})
      .filter(source => {
        if (argv.source ? argv.source !== source.name : !source.active) {
          runningSources[source.name] = 'filtered';
          if (!argv.source) log.debug(`Skipping inactive source: ${source.name}`);
          return false;
        }

        return true;
      })
      .empty(() => {
        log.error(`I'm sorry Dave, I searched all known sources and can't find anything for "${argv.source}"`);
        throw new FetchError(STREAM_END);
      })
      .do(source => {
        log.debug(`Starting fetch for ${source.name}`);
        runningSources[source.name] = 'started';
      })
      .map(async (source) => getMeasurementsFromSource(source, argv.dryrun))
      .do(async ({stream}) => {
        if (argv.dryrun) {
          return stream
            .do(m => log.info(m))
            .run();
        } else {
          const s3 = require('aws-sdk').S3();
          const key = `realtime/${moment().format('YYYY-MM-DD/X')}.ndjson`;

          const pg = getDB();

          await Promise.all([
            streamDataToS3(stream, s3, bucketName, key),
            streamDataToDB(stream, pg)
          ]);
        }
      })
      .do(({source}) => {
        runningSources[source.name] = 'finished';
      })
      .use(forwardErrors)
      .map(measurements => {
        log.info(`Fetch results for ${measurements.source.name}`);
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
        results => {
          if (argv.dryrun) {
            log.info('Dry run ended.');
            throw new FetchError(STREAM_END);
          }

          return Promise.all([
            // TODO: saveFetches, saveSources
            saveFetches(timeStarted, Date.now(), itemsInsertedCount, null, results),
            saveSources(sources)
          ]);
        }
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
        (error) => {
          const cause = error instanceof FetchError ? error : error.cause;
          if (cause instanceof FetchError) {
            if (cause.is(STREAM_END)) process.exit(cause.exitCode || 0);

            log.error('Fetch error occurred', cause.stack);
          } else {
            log.error('Runtime error occurred', error);
          }
          process.exit((cause && cause.exitCode) || 100);
        }
      );
  })()
]);
