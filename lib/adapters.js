import log from './logger';
import { promisify } from 'util';
import { readdir } from 'fs';
import { resolve } from 'path';
import { FetchError, ADAPTER_NAME_INVALID, STREAM_END } from './errors';
import { saveFetches, saveSources } from './db';
import { sendUpdatedWebhook } from './notification';

let _preloadedAdapterNames = null;
const getValidAdapterNames = () => {
  if (_preloadedAdapterNames) return _preloadedAdapterNames;

  _preloadedAdapterNames = promisify(readdir)(resolve(__dirname, '../adapters/'))
    .then(
      list => list
        .filter(name => name.endsWith('.js'))
        .map(name => name.substring(0, name.length - 3))
    );
  return _preloadedAdapterNames;
};

const _adapterCache = {};
const importAdapter = async (adapter) => {
  if (adapter in _adapterCache) return _adapterCache[adapter];

  _adapterCache[adapter] = Promise.resolve().then(() => require(adapter));

  return _adapterCache[adapter];
};

/**
 * Find the adapter for a given source.
 *
 * @param {string} name An adapter adapter
 * @return {Adapter} The associated adapter
 */
export const getAdapterForSource = async (source) => {
  const {adapter, name} = source;
  const validPreloadedAdapterNames = await getValidAdapterNames();

  if (validPreloadedAdapterNames.includes(adapter)) {
    log.debug(`Using preloaded adapter "${adapter}" for source ${name}`);
    return importAdapter(`../adapters/${adapter}`);
  } else {
    throw new FetchError(ADAPTER_NAME_INVALID, source);
  }
};

/**
 * A stream transform that filters out sources not needed in the run.
 *
 * * If argv contains a source name, only that source will be chosen, others will be filtered out.
 * * Otherwise inactive sources will be filtered out.
 *
 * Inactive source will be executed even if is inactive.
 *
 * @param {DataStream<Source>} stream the stream of sources
 * @param {Object} argv parsed process arguments
 * @param {Object} runningSources a hash of sources that will be updated
 */
export function chooseSourcesBasedOnEnv (stream, {source}, runningSources) {
  return stream
    .filter(selectActiveOrRequestedSources(source, runningSources))
    .empty(reportNoSourcesAvailable(source))
  ;
}

/**
 * Chooses only requested sources.
 *
 * @param {String} [name] source name to select
 * @param {Object} runningSources a hash of sources that will be updated
 */
export function selectActiveOrRequestedSources (name, runningSources) {
  if (name) log.info(`Looking up source ${name}`);

  return source => {
    if (name ? name !== source.name : !source.active) {
      runningSources[source.name] = 'filtered';
      if (!name) {
        log.debug(`Skipping inactive source: ${source.name}`);
      }
      return false;
    }

    return true;
  };
}

/**
 * Reports no sources available to logs throws an exiting error.
 *
 * @param {String} name
 */
export function reportNoSourcesAvailable (name) {
  return () => {
    log.error(`I'm sorry Dave, I searched all known sources and can't find anything for "${name}"`);
    throw new FetchError(STREAM_END, null, null, 100);
  };
}

/**
 * Marks source with given value in runningSources hash.
 *
 * @param {String} value
 * @param {Object} runningSources
 */
export function markSourceAs (value, runningSources) {
  return source => {
    const name = source.source ? source.source.name : source.name;
    log.debug(`Source ${name} is "${value}"`);
    runningSources[name] = value;
  };
}

/**
 * Completes the fetchReport based on results from fetch process.
 *
 * @param {FetchReport} fetchReport
 */
export function prepareCompleteResultsMessage (fetchReport) {
  return measurements => {
    log.info(`Fetch results for ${measurements.source.name}`);
    const result = measurements.resultsMessage;
    // Add to inserted count if response has a count, if there was a failure
    // response will not have a count
    if (result.count !== undefined) {
      fetchReport.itemsInserted += result.count;
    }
    log.info('///////');
    log.info(result.message);
    for (let [error, count] of Object.entries(result.failures || {})) {
      log.info(`${count} occurrences of ${error}`);
    }
    log.info('///////');
    return result;
  };
}

/**
 * Reports and saves fetch information.
 *
 * @param {FetchReport} fetchReport
 * @param {Source[]} sources
 * @param {Object} argv
 * @param {URL} apiURL
 * @param {String} webhookKey
 */
export function reportAndRecordFetch (fetchReport, sources, argv, apiURL, webhookKey) {
  return async (results) => {
    fetchReport.results = results;
    fetchReport.timeEnded = Date.now();
    fetchReport.errors = results.reduce((acc, {failures}) => {
      Object.entries(failures).forEach(([key, count]) => {
        acc[key] = (acc[key] || 0) + count;
      });
      return acc;
    }, {});

    if (argv.dryrun) {
      log.info(fetchReport);
      log.info('Dry run ended.');
      return 0;
    }

    await Promise.all([
      saveFetches(fetchReport),
      saveSources(sources)
    ]);
    await sendUpdatedWebhook(apiURL, webhookKey);
    log.info('Webhook posted, have a good day!');
    return 0;
  };
}
