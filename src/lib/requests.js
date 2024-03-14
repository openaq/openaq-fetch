'use strict';

import log from './logger.js';
import { REQUEST_TIMEOUT, REQUEST_RETRIES } from './constants.js';
import got from 'got';
import { FetchError, AdapterError, DATA_URL_ERROR } from './errors.js';

const headers = {
		get: { 'User-Agent': 'OpenAQ' },
		post: {
				'User-Agent': 'OpenAQ',
				accept: "application/json, text/javascript, */*; q=0.01",
				"accept-language": "en-US,en;q=0.9",
				"cache-control": "no-cache",
				"content-type": "application/x-www-form-urlencoded; charset=UTF-8",
				pragma: "no-cache",
    }
};

export default (source, cb, method = 'GET', params='', responseType='json') => {
  let url, timeout, retries;
  if(typeof(source) === 'object' && source.url) {
    log.debug('Adapter passed along a source object');
    url = source.url;
    retries = source.retries || REQUEST_RETRIES;
    timeout = source.timeout || REQUEST_TIMEOUT;
  } else if (typeof(source) === 'string') { // assume source is the url
    url = source;
    retries = REQUEST_RETRIES;
    timeout = REQUEST_TIMEOUT;
  } else {
    throw new AdapterError(DATA_URL_ERROR, null, 'No url was passed');
  }

  if(typeof(params) === 'object') {
			// convert to string
	}

	const options = {
			method,
			body: params,
			responseType,
			timeout: {
					request: timeout,
			},
			retry: {
					limit: retries,
					errorCodes: [
							'ETIMEDOUT'
					],
			},
			headers: headers.post,
			hooks: {
					beforeRetry: [
							data => {
									log.warn(`Retrying request to ${url}`);
							}
					],
			}
	};

	//const opt = !!options ? options : internal_options;

  const requestClient = got.extend(options);
  log.debug(`Requesting response from ${options.method}: ${url}`);
  // make the request
  return requestClient(url)
    .then( res => {
      // could do some checking here
      return res;
    })
			.catch( cause => {
				const err = new FetchError(DATA_URL_ERROR, source, 'request client error', `${cause.code}:${url}`);
      if (cb) {
        return cb({ message: err });
      } else {
				throw err;
      }
    });
};
