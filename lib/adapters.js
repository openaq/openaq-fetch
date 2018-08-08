import log from './logger';
import adapters from '../adapters';

/**
 * Find the adapter for a given source
 * @param {string} name An adapter adapter
 * @return {Adapter} The associated adapter
 */
export const getAdapterForSource = async ({adapter}) => {
  log.debug(`looking for ${adapter}`);
  return Object.values(adapters).find(a => a.name === adapter);
};
