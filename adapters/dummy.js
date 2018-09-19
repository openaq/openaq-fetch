import {FetchError, DATA_URL_ERROR} from '../lib/errors';

exports.fetchStream = function (source) {
  if (source.data) {
    source.data.name = source.name;
    return source.data;
  }

  throw new FetchError(DATA_URL_ERROR);
};
