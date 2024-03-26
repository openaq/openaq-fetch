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

/**
 * Executes HTTP requests with support for different response types and data processing methods.
 *
 * @param {Object} options - The configuration options for the request.
 * @param {string} options.url - The URL to request.
 * @param {Object} [options.params] - URL parameters for GET requests or data for POST requests.
 * @param {Object} [options.headers] - HTTP request headers.
 * @param {number} [options.timeout=REQUEST_TIMEOUT] - Request timeout in milliseconds.
 * @param {number} [options.retries=REQUEST_RETRIES] - Number of retries on request failure.
 * @param {string} [options.method='GET'] - HTTP request method (GET, POST, etc.).
 * @param {string} [options.responseType='json'] - Expected response type from the server.
 * @param {string} [options.as] - Desired format for the response data (overrides responseType).
 * @param {Object} [options.https] - HTTPS request options.
 * @param {Object} [options.csvOptions] - Options for parsing CSV responses.
 * @param {Object} [options.xmlOptions] - Options for parsing XML responses.
 * @param {Object} [options.htmlOptions] - Options for parsing HTML responses.
 * @param {Object} [options.cookieJar] - Cookie jar for maintaining session cookies.
 * @returns {Promise<*>} A promise that resolves with the processed response data.
 * @throws {Error} Throws an error if the URL is not provided or if an unsupported parameters type is given.
 */
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

/**
 * Parses a CSV formatted response body using the provided options.
 *
 * @param {string} body - The CSV string to parse.
 * @param {Object} options - The options for CSV parsing.
 * @returns {Object[]} An array of objects representing the parsed CSV data.
 */
function toCSV(body, options) {
    return parse(body, options);
}

/**
 * Parses an XML formatted response body into a cheerio object for easy manipulation and querying.
 *
 * @param {string} body - The XML string to parse.
 * @param {Object} options - The options for XML parsing, with xmlMode set to true by default.
 * @returns {Object} A cheerio object representing the parsed XML document.
 */
function toXML(body, options) {
    // force xmlMode
    options.xmlMode = true;
    return load(body, options);
}

/**
 * Parses an HTML formatted response body into a cheerio object for easy manipulation and querying.
 *
 * @param {string} body - The HTML string to parse.
 * @param {Object} options - The options for HTML parsing.
 * @returns {Object} A cheerio object representing the parsed HTML document.
 */
function toHTML(body, options) {
    return load(body, options);
}
