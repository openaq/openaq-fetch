/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the South African data sources.
 */

'use strict';

import {
  unifyMeasurementUnits,
  removeUnwantedParameters,
  unifyParameters,
} from '../lib/utils.js';
import log from '../lib/logger.js';

import { DateTime } from 'luxon';
import _ from 'lodash';
import client from '../lib/requests.js';

export const name = 'southafrica';

/**
 * Fetches the data for a given source and returns an appropriate objectlog
 *
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export async function fetchData (source, cb) {
  try {
		// source has a redirect that goes to an html page which causes issues
    const body = await client({ url: source.url });

    // Wrap everything in a try/catch in case something goes wrong
    // Format the data
    const data = formatData(body);
    // Make sure the data is valid
    if (data === undefined) {
      return cb({ message: 'Failure to parse data.' });
    }
    cb(null, data);
  } catch (err) {
    log.error('Request error:', err); // Log the error object
    return cb(err, { message: 'Failure to load data url.' });
  }
}

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */

const formatData = function (data) {
  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  const parseDate = function (m) {
    let date;
    if (m.includes('/')) {
      date = DateTime.fromFormat(m, 'yyyy/MM/dd HH:mm', {
        zone: 'Africa/Johannesburg',
      });
    } else if (m.includes('T') && m.includes('+')) {
      date = DateTime.fromISO(m, { zone: 'Africa/Johannesburg' });
    } else {
      return null;
    }
    return {
      utc: date.toUTC().toISO({ suppressMilliseconds: true }),
      local: date.toISO({ suppressMilliseconds: true }),
    };
  };

  let measurements = [];
  _.forEach(data, function (s) {
    const base = {
      location: s.name,
      city: s.city,
      coordinates: {
        latitude: parseFloat(s.latitude),
        longitude: parseFloat(s.longitude),
      },
      attribution: [
        {
          name: 'South African Air Quality Information System',
          url: 'http://saaqis.environment.gov.za',
        },
      ],
      averagingPeriod: { unit: 'hours', value: 1 },
    };
    _.forOwn(s.monitors, function (v, key) {
      if (v.value !== null && v.value !== '' && v.DateVal !== null) {
        let m = _.clone(base);
        m.parameter = v.Pollutantname;
        m.value = parseFloat(v.value);
        m.unit = v.unit;
        m.date = parseDate(v.DateVal);
        m = unifyMeasurementUnits(m);
        m = unifyParameters(m);
        measurements.push(m);
      }
    });
  });

  measurements = removeUnwantedParameters(measurements);
  return { name: 'unused', measurements: measurements };
};
