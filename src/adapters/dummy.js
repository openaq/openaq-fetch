import {FetchError, DATA_URL_ERROR} from '../lib/errors';
import log from '../lib/logger';

function extractItemType (item) {
  return Object.getPrototypeOf(item).name || typeof item;
}

export const name = 'Dummy';
export function fetchStream (source) {
  if (source.data) {
    if (!Array.isArray(source.data)) throw source.data;

    const ret = function * () {
      try {
        for (let item of source.data) {
          log.verbose(`Handling measurement of type ${extractItemType(item)}`);

          if (item instanceof Error) yield Promise.reject(item);
          else yield item;
        }
      } catch (e) {}
    };

    return ret;
  }

  throw new FetchError(DATA_URL_ERROR);
}
