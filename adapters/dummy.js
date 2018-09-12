import {FetchError} from '../lib/errors';

exports.fetchStream = function (source) {
  if (source.data) {
    source.data.name = source.name;
    return source.data;
  }

  throw new FetchError('Data not provided');
};
