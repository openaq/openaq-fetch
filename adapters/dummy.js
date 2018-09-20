import {FetchError, DATA_URL_ERROR} from '../lib/errors';

exports.fetchStream = function (source) {
  if (source.data) {
    if (!Array.isArray(source.data)) throw source.data;

    const ret = function * () {
      for (let item of source.data) {
        if (item instanceof Error) yield Promise.reject(item);
        else yield item;
      }
    };
    return ret;
  }

  throw new FetchError(DATA_URL_ERROR);
};
