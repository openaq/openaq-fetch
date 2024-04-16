'use strict';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as baseRequest } from 'request';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DateTime } from 'luxon';
import proj4 from 'proj4';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

// The platform supported parameters
export const acceptableParameters = ['pm25', 'pm10', 'co', 'so2', 'no2', 'bc', 'o3', 'no', 'pm1', 'nox'];

export const notEmpty = x => x;
export const ignore = () => 0;

/**
 * Legacy adapter compatibility method, not needed anymore.
 * @param {*} input
 */
export function convertUnits (input) { return input; }

/**
 * Convert units into preferred units.
 *
 * @summary The preferred unit for mass concentration is 'µg/m³', for volumetric
 * concentrations this is 'ppm'.
 * @param {Array} measurements An array of measurements to potentially convert units of
 * @return {Array} An array of measurements converted to system-preferred units
 */
export function unifyMeasurementUnits (m) {
  if (!m || typeof m.unit !== 'string' || isNaN(+m.value)) return;

  // ignore and pass through values that are known error codes
  if (m.value === -9999 || m.value === 9999) {
    return m;
  }

  m.unit = m.unit && m.unit.toLowerCase();

  switch (m.unit) {
    case 'pphm':
      m.value = m.value / 100;
      m.unit = 'ppm';
      break;
    case 'ppb':
      m.value = m.value / 1000;
      m.unit = 'ppm';
      break;
    case 'ppt':
      m.value = m.value / 1000000;
      m.unit = 'ppm';
      break;
    case 'µg/m3':
    case 'ug/m3':
    case 'µg/m³':
    case 'ug/m³':
      m.unit = 'µg/m³';
      break;
    case 'mg/m3':
    case 'mg/m³':
      m.value = m.value * 1000;
      m.unit = 'µg/m³';
      break;
  }

  return m;
}

export function __dirname () {

}

/**
 * Transforms latitude and longitude coordinates from a specified projection system to the EPSG:4326 system.
 *
 * @param {number|string} latitude The latitude in degrees or as a string.
 * @param {number|string} longitude The longitude in degrees or as a string.
 * @param {string} [proj='EPSG:4326'] The current projection of the coordinates.
 * @returns {Object} An object containing the latitude and longitude in decimal degrees.
 * @throws {Error} If latitude or longitude is missing or cannot be converted to a float.
 */
export function parseCoordinates(latitude, longitude, proj) {
    // arg checks
    if(!latitude) {
        throw new Error(`Missing latitude`);
    }
    if(!longitude) {
        throw new Error(`Missing longitude`);
    }
    // fix strings
    if(typeof(latitude) === 'string') {
        latitude = parseFloat(latitude);
    }
    if(typeof(longitude) === 'string') {
        longitude = parseFloat(longitude);
    }

    if(proj && proj !== 'EPSG:4326') {
        const coords = proj4(proj, 'EPSG:4326', [longitude, latitude]);
        latitude = coords[1];
        longitude = coords[0];
    }

    return {
        latitude,
        longitude
    };
}


/**
 * Helper function to get the current truncated hour in UTC
 * @param {int} hours the number of hours (+/-) to adjust the time
 * @returns {DateTime}
 */
export function hourUTC(hours=0) {
    return DateTime
        .now()
        .plus({ hours })
        .set({ minute: 0, second: 0, millisecond: 0 })
        .toUTC();
}

/**
 * Parses a timestamp string according to a specified format and timezone,
 * returning the time in UTC.
 *
 * @param {string} str The timestamp string to parse.
 * @param {string} format The format string used to parse the timestamp.
 * @param {string} [zone='utc'] The timezone of the input timestamp.
 * @returns {Object} An object containing the parsed timestamp in UTC.
 * @throws {Error} If the timestamp cannot be parsed.
 */
export function parseTimestamp(str, format, zone='utc') { // we do not need local time
    const opts = { zone };
    const output_format = "yyyy-MM-dd'T'HH:mm:ss'Z'";
    const dt = DateTime.fromFormat(str, format);
    if(!dt.isValid) {
        // if this doesnt work it will throw an error and we can
        // catch it and skip this one
        throw new Error(`Could not parse '${str}' using '${format}'`);
    }
    if(zone.toLowerCase() === 'utc') {
        return { utc: dt.toFormat(output_format) };
    } else {
        return { utc: dt.toUTC().toFormat(output_format) };
    }
}

/**
 * Normalizes air quality measurement parameters by removing dots and underscores and converting to lowercase.
 *
 * @param {Object} m A measurement object containing the parameter to normalize.
 * @returns {Object} The measurement with the normalized parameter.
 */
export function unifyParameters (m) {
  if (m && typeof m.parameter === 'string') {
    m.parameter = m.parameter.toLowerCase().replace('.', '').replace('_', '');
  }

  return m;
}

/**
 * Converts a string to title case, capitalizing the first letter of each word.
 *
 * @param {string} str The string to convert to title case.
 * @returns {string} The string in title case.
 */
export function toTitleCase (str) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

/**
 * Safely parse JSON
 * @summary Try to safely parse JSON.
 * @param {string} string of JSON to parse
 * @return A JSON object or undefined
 */
export function safeParse (json) {
  let parsed;

  try {
    parsed = JSON.parse(json);
  } catch (e) {
    // Nothing needed here
  }

  return parsed;
}

/**
 * Delays execution for a specified amount of time, or defers it to the next event loop iteration.
 *
 * @param {number} [timeout=0] The delay in milliseconds before resolving the promise. If 0, defers to next event loop iteration.
 * @returns {Promise<void>} A promise that resolves after the specified timeout.
 */
export async function defer (timeout = 0) {
  return new Promise(resolve => {
    if (timeout > 0) return setTimeout(resolve, timeout);

    return setImmediate(resolve);
  });
}

/**
 * Filters out measurements that do not match the acceptable parameters list.
 *
 * @param {Array} measurements An array of measurement objects to filter.
 * @returns {Array} An array of measurements that have acceptable parameters.
 */
export function removeUnwantedParameters (measurements) {
  return measurements.filter(({parameter}) => acceptableParameters.includes(parameter));
}

/**
 * Promisifies the request operation for making HTTP GET requests.
 *
 * @param {string} url The URL to which the request is sent.
 * @param {Object} [options={}] Optional parameters and request headers.
 * @returns {Promise<*>} A promise that resolves with the response data upon successful completion of the request.
 * @throws {Error} An error is thrown if the request fails or if the server's response is not 200 OK.
 */
export async function promiseRequest (url, options = {}) {
  return new Promise((resolve, reject) => {
    request(url, options, (error, res, data) => {
      if (!error && res.statusCode === 200) {
        resolve(data);
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Promisifies the request operation for making HTTP POST requests.
 *
 * @param {string} url The URL to which the request is sent.
 * @param {Object} formParams Parameters to be sent in the body of the POST request.
 * @returns {Promise<*>} A promise that resolves with the response data upon successful completion of the request.
 * @throws {Error} An error is thrown if the request fails or if the server's response is not 200 OK.
 */
export async function promisePostRequest (url, formParams) {
  return new Promise((resolve, reject) => {
    request.post(url, { form: formParams }, (error, res, data) => {
      if (!error && res.statusCode === 200) {
        resolve(data);
      } else {
        reject(error);
      }
    });
  });
}
