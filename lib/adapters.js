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
  } else if (adapter.startsWith('@openaq-fetch')) {
    log.debug(`Using adapter module "${adapter}" for source ${name}`);
    return importAdapter(adapter);
  } else {
    throw new FetchError(ADAPTER_NAME_INVALID, source);
  }
};

export function chooseSourcesBasedOnArgv (stream, {source}, runningSources) {
  return stream
    .filter(selectActiveOrRequestedSources(source, log, runningSources))
    .empty(reportNoSourcesAvailable(source))
  ;
}

export function selectActiveOrRequestedSources (name, log, runningSources) {
  name && log.info(`Looking up source ${name}`);
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

export function reportNoSourcesAvailable (name) {
  return () => {
    log.error(`I'm sorry Dave, I searched all known sources and can't find anything for "${name}"`);
    throw new FetchError(STREAM_END, null, null, 0);
  };
}

export function markSourceAs (value, runningSources) {
  return source => {
    log.debug(`Starting fetch for ${source.name}`);
    runningSources[source.name] = value;
  };
}

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

export function reportAndRecordFetch (fetchReport, sources, argv, apiURL, webhookKey) {
  return async (results) => {
    if (argv.dryrun) {
      log.info('Dry run ended.');
      return 0;
    }

    fetchReport.results = results;
    fetchReport.timeEnded = Date.now();
    await Promise.all([
      saveFetches(fetchReport),
      saveSources(sources)
    ]);
    await sendUpdatedWebhook(apiURL, webhookKey);
    log.info('Webhook posted, have a good day!');
    return 0;
  };
}