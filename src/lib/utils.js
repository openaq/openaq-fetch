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
 * Convert units into system-preferred units.
 *
 *
 *
 * @summary The preferred unit for mass concentration is 'µg/m3', for volumetric
 * concentrations this is 'ppm'.
 * @param {Array} measurements An array of measurements to potentially convert units of
 * @return {Array} An array of measurements converted to system-preferred units
 */
export function unifyMeasurementUnits (m) {
  if (!m || typeof m.unit !== 'string' || isNaN(+m.value)) return;

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

// we do not need local time
export function parseTimestamp(str, format, zone='utc') {
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


export function unifyParameters (m) {
  if (m && typeof m.parameter === 'string') {
    m.parameter = m.parameter.toLowerCase().replace('.', '').replace('_', '');
  }

  return m;
}

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

export async function defer (timeout = 0) {
  return new Promise(resolve => {
    if (timeout > 0) return setTimeout(resolve, timeout);

    return setImmediate(resolve);
  });
}

export function removeUnwantedParameters (measurements) {
  return measurements.filter(({parameter}) => acceptableParameters.includes(parameter));
}

// Promisify request
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
