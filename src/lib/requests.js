'use strict';

import log from './logger.js';
import { REQUEST_TIMEOUT, REQUEST_RETRIES } from './constants.js';
import got from 'got';
import { FetchError, AdapterError, DATA_URL_ERROR } from './errors.js';
import { parse } from 'csv-parse/sync';
import { load } from 'cheerio';


const DEFAULT_HEADERS = {
    'User-Agent': 'OpenAQ',
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    pragma: "no-cache",
};

export default ({
		url,
		params,
		headers,
		timeout = REQUEST_TIMEOUT,
		retries = REQUEST_RETRIES,
		method = 'GET',
		responseType = 'json',
    as,  // new argument that will replace responseType, eventually defaulted to json
		https = {},
    csvOptions = { trim: true, comment: '#', skip_empty_lines: true, columns: true },
    xmlOptions = { xmlMode: true },
    htmlOptions = { },
    cookieJar,
}) => {

		let body, requestClient, toData = toSame;
		if (!url) throw new Error('No url passed to request client');

    // How would we like the data returned?
    // each method should also include an options arg above
    // e.g. csv has a csvOptions
    if(as) {
        switch (as.toLowerCase()) {
        case 'csv':
            responseType = 'text';
            toData = (b) => toCSV(b, csvOptions);
            break;
        case 'xml':
            responseType = 'text';
            toData = (b) => toXML(b, xmlOptions);
            break;
        case 'html':
            responseType = 'text';
            toData = (b) => toHTML(b, htmlOptions);
            break;
        case 'text':
            responseType = 'text';
            toData = toSame;
            break;
        case 'json':
            responseType = 'json';
            toData = toSame;
            break;
        }
    }

		if(params && typeof(params) === 'object') {
				// convert to string
				const q = new URLSearchParams(params);
				if(method == 'GET') {
						url = `${url}?${q.toString()}`;
				} else if(method == 'POST') {
						body = `${q.toString()}`;
				}
		} else if(params) {
				throw new Error(`Parameters must be passed as an object and not as ${typeof(params)}`);
		}

		// if we have not passed any headers than use the default
    // reverting to using the same default headers for all methods
		if(!headers) {
				headers = DEFAULT_HEADERS;
		} else {
				// otherwise make sure we are passing a user agent
				headers['User-Agent'] = 'OpenAQ';
		}

		const options = {
				method,
				body,
				https,
        cookieJar,
				responseType,
				timeout: {
						request: timeout,
				},
        retry: {
            limit: retries,
            errorCodes: [
                'ECONNRESET',
                'EADDRINUSE',
                'ECONNREFUSED',
                'EPIPE',
                'ENOTFOUND',
                'ENETUNREACH',
                'EAI_AGAIN'
            ],
        },
				headers,
				hooks: {
						beforeRetry: [
								data => {
										log.warn(`Retrying request to ${url}`);
								}
						],
				}
		};

		try {
				requestClient = got.extend(options);
		} catch(err) {
				throw new Error(`Could not extend request client: ${err.message}`);
		}
		log.debug(`Requesting response from ${method}: ${url}`);
		// make the request
		return requestClient(url)
				.then( res => {
						// could do some checking here
						if (res.statusCode == 200) {
								if(!res.body) {
										throw new Error('Request was successful but did not contain a body.');
								}
								return toData(res.body);
						} else if (res.statusCode == 403) {
								throw new Error('Server responsed with forbidden (403).');
						} else {
								throw new Error(`Failure to load data url (${res.statusCode}).`);
						}
				});
};

function toSame(body) {
    return body;
}

function toCSV(body, options) {
    return parse(body, options);
}

function toXML(body, options) {
    // force xmlMode
    options.xmlMode = true;
    return load(body, options);
}

function toHTML(body, options) {
    return load(body, options);
}
