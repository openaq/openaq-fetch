'use strict';

import log from './logger.js';
import { REQUEST_TIMEOUT, REQUEST_RETRIES } from './constants.js';
import got from 'got'
import { AdapterError, DATA_URL_ERROR } from './errors.js';

const headers = { 'User-Agent': 'OpenAQ' }




export default (source, cb) => {
  let url, timeout, retries;
  if(typeof(source) === 'object' && source.url) {
    log.debug('Adapter passed along a source object')
    url = source.url
    retries = source.retries || REQUEST_RETRIES
    timeout = source.timeout || REQUEST_TIMEOUT
  } else if (typeof(source) === 'string') { // assume source is the url
    log.debug('Adapter passed along a url')
    url = source
    retries = REQUEST_RETRIES
    timeout = REQUEST_TIMEOUT
  } else {
    throw new AdapterError(DATA_URL_ERROR, null, 'No url was passed')
  }
  // setup the options
  const requestClient = got.extend({
	  timeout: {
      request: REQUEST_TIMEOUT
    },
	  retry: {
      limit: source.retries || 3,
      errorCodes: [
        'ETIMEDOUT'
      ],
    },
    headers: headers,
    hooks: {
      beforeRetry: [
        data => {
          log.warn(`Retrying request to ${url}`)
        }
      ],
    }
	});
  log.debug(`Requesting response from ${url}`)
  // make the request
  return requestClient(url)
    .then( res => {
      // could do some checking here
      return res
    })
    .catch( err => {
      if (cb) {
        return cb({ message: err })
      } else {
        log.error(`Error caught in got client - ${err.status_code}`)
      }
    })
};
