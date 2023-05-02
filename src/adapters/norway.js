/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Norwegian data sources.
 */

'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { DateTime } from 'luxon';
import got from 'got';

export const name = 'norway';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export async function fetchData (source, cb) {
  try {
    const response = await got(source.url, { timeout: { request: REQUEST_TIMEOUT } });

    if (response.statusCode !== 200) {
      return cb({ message: 'Failure to load data url.' });
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(response.body);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({ message: 'Failure to parse data.' });
      }
      cb(null, data);
    } catch (e) {
      return cb({ message: 'Unknown adapter error.' });
    }
  } catch (err) {
    return cb({ message: 'Failure to load data url.' });
  }
}

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
const formatData = function (data) {
  // Wrap the JSON.parse() in a try/catch in case it fails
  try {
    data = JSON.parse(data);
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }

  /**
   * Given a json object, convert to aq openaq format
   * @param {json object} item coming from source data
   * @return {object} a repacked object
   */
  const aqRepack = (item) => {
    const dateLuxon = DateTime.fromISO(item.toTime, { zone: 'Europe/Oslo' });
    const template = {
      location: item.station,
      city: item.area,
      parameter: item.component.toLowerCase().replace('.', ''),
      date: {
        utc: dateLuxon.toUTC().toISO({ suppressMilliseconds: true }),
        local: dateLuxon.toISO({ suppressMilliseconds: true })
      },
      coordinates: {
        latitude: item.latitude,
        longitude: item.longitude
      },
      value: parseFloat(item.value),
      unit: item.unit,
      attribution: [{ name: 'Luftkvalitet.info', url: 'http://www.luftkvalitet.info/home.aspx' }],
      averagingPeriod: { unit: 'hours', value: 1 }
    };

    return template;
  };

  const measurements = data.map(aqRepack);
  return { name: 'unused', measurements: measurements };
};
