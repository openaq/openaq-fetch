import log from './logger';
import { promisify } from 'util';
import { readdir } from 'fs';
import { resolve } from 'path';
import { ADAPTER_NAME_INVALID, AdapterError, ADAPTER_MODULE_INVALID, ADAPTER_RESOLVE_ERROR, ADAPTER_NOT_FOUND, ignore } from './errors';
import { DataStream } from 'scramjet';

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

  _adapterCache[adapter] = Promise.resolve()
    .then(
      () => require(adapter)
    );

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
  try {
    const validPreloadedAdapterNames = await getValidAdapterNames();

    if (validPreloadedAdapterNames.includes(adapter)) {
      log.debug(`Using preloaded adapter "${adapter}" for source ${name}`);
      const adapterModule = await importAdapter(`../adapters/${adapter}`);

      if (isValidAdapter(adapterModule)) {
        throw new AdapterError(ADAPTER_MODULE_INVALID, source, null, 104);
      }
      return adapterModule;
    } else {
      throw new AdapterError(ADAPTER_NAME_INVALID, source, null, 103);
    }
  } catch (error) {
    throw new AdapterError(ADAPTER_RESOLVE_ERROR, source, error, 102);
  }
};

function isValidAdapter (adapterModule) {
  return !adapterModule || !(adapterModule.fetchData || adapterModule.fetchStream);
}

/**
 * A stream transform that filters out sources not needed in the run.
 *
 * * If argv contains a source name, only that source will be chosen, others will be filtered out.
 * * Otherwise inactive sources will be filtered out.
 *
 * Inactive source will be executed even if is inactive.
 *
 * @param {DataStream} stream the stream of sources
 * @param {Object} argv parsed process arguments
 * @param {Object} runningSources a hash of sources that will be updated
 */
export function chooseSourcesBasedOnEnv (stream, {source}, runningSources) {
  const out = new DataStream({referrer: stream});

  let z = 0;
  stream
    .filter(selectActiveOrRequestedSources(source, runningSources))
    .each(async source => {
      z = 1;
      await out.whenWrote(source);
    })
    .whenEnd()
    .then(async () => {
      return z || reportNoSourcesAvailable(source);
    })
    .then(
      () => {
        out.end();
      },
      (err) => {
        out.raise(err);
      }
    )
    .catch(ignore);

  return out;
}

/**
 * Chooses only requested sources.
 *
 * @param {String} [name] source name to select
 * @param {Object} runningSources a hash of sources that will be updated
 */
function selectActiveOrRequestedSources (name, runningSources) {
  if (name) log.info(`Looking up source ${name}`);

  return source => {
    if (name ? name !== source.name : !source.active) {
      delete runningSources[source.name];
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
function reportNoSourcesAvailable (name) {
  if (name) {
    throw new AdapterError(ADAPTER_NOT_FOUND, null, new Error(`I'm sorry Dave, I searched all known sources and can't find anything for "${name}"`), 101);
  } else {
    throw new AdapterError(ADAPTER_NOT_FOUND, null, new Error('No sources to run'), 101);
  }
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
export function prepareCompleteResultsMessage (stream, fetchReport, {dryrun}) {
  return stream.map(
    measurements => {
      log.info(`Fetch results for ${measurements.source.name}`);
      const result = measurements.resultsMessage;
      // Add to inserted count if response has a count, if there was a failure
      // response will not have a count
      if (result.count > 0) {
        fetchReport.itemsInserted += result.count;
      }

      const { total, inserted } = measurements.counts;
      log.info('///////');
      if (dryrun) {
        log.info(`New measurements found for "${result.sourceName}": ${total} in ${result.duration}s`);
      } else {
        log.info(`New measurements inserted for "${result.sourceName}": ${inserted} (of ${total}) in ${result.duration}s`);
      }
      for (let [error, count] of Object.entries(result.failures || {})) {
        log.info(`${count} occurrences of ${error}`);
      }
      log.info('///////');

      return result;
    }
  );
}
