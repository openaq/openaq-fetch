import log from './logger';
import { promisify } from 'util';
import { readdir } from 'fs';
import { resolve } from 'path';
import { FetchError, ADAPTER_NAME_INVALID } from './errors';

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
