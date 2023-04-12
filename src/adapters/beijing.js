/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data from StateAir.net data source.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import got from 'got';
import cloneDeep from 'lodash/cloneDeep.js';
import { DateTime } from 'luxon';
import cheerio from 'cheerio';

export const name = 'beijing';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @return {Promise<object>} A Promise that resolves to the fetched data
 */

export const fetchData = function (source, cb) {
  got(source.url, { timeout: { request: REQUEST_TIMEOUT } })
    .then((response) => {
      if (response.statusCode !== 200) {
        return cb({ message: 'Failure to load data url.' });
      }

      // Wrap everything in a try/catch in case something goes wrong
      try {
        // Format the data
        let data = formatData(response.body, source);

        // Make sure the data is valid
        if (data === undefined) {
          return cb({ message: 'Failure to parse data.' });
        }
        cb(null, data);
      } catch (e) {
        return cb({ message: 'Unknown adapter error.' });
      }
    })
    .catch((error) => {
      return cb({ message: 'Failure to load data url.', error });
    });
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} data Fetched source data
 * @param {object} source A valid source object
 * @return {object} Parsed and standardized data our system can use
 */
const formatData = function (data, source) {
  /**
   * Given a date string, convert to system appropriate times.
   * @param {string} dateString Date in string format coming from source data
   * @return {object} An object containing both UTC and local times
   */
  const getDate = function (dateString) {
    // Validate input
    if (typeof dateString !== 'string' || dateString.trim() === '') {
      throw new Error('Invalid date string');
    }

    try {
      // Create DateTime object with timezone using the fromFormat() method
      const date = DateTime.fromFormat(
        dateString,
        'M/d/yyyy h:mm:ss a',
        {
          zone: 'Asia/Shanghai',
        }
      );

      // Return UTC and local ISO strings
      return {
        utc: date.toISO({
          suppressMilliseconds: true,
          includeOffset: true,
        }),
        local: date.toISO({ suppressMilliseconds: true }),
      };
    } catch (error) {
      console.error('Error parsing date:', error);
      throw new Error('Error parsing date');
    }
  };

  // Load all the XML
  let $ = cheerio.load(data, { xmlMode: true });

  // Create measurements array
  let measurements = [];

  // Build up the base object
  let baseObj = {
    location: source.name,
    parameter: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: { value: 1, unit: 'hours' },
    attribution: [
      {
        name: 'StateAir.net',
        url: source.sourceURL,
      },
    ],
    coordinates: getCoordinates(source.name),
  };

  // Loop over each item and save the object
  $('item').each(function (i, elem) {
    // Clone base object
    let obj = cloneDeep(baseObj);

    obj.value = Number($(elem).children('Conc').text());
    obj.date = getDate($(elem).children('ReadingDateTime').text());
    measurements.push(obj);
  });

  return {
    name: 'unused',
    measurements: measurements,
  };
};

export const getCoordinates = function (location) {
  switch (location) {
    case 'Beijing US Embassy':
      return {
        latitude: 39.95,
        longitude: 116.47,
      };
    case 'Chengdu':
      return {
        latitude: 30.63,
        longitude: 104.07,
      };
    case 'Guangzhou':
      return {
        latitude: 23.12,
        longitude: 113.32,
      };
    case 'Shanghai':
      return {
        latitude: 31.21,
        longitude: 121.44,
      };
    case 'Shenyang':
      return {
        latitude: 41.78,
        longitude: 123.42,
      };
  }
};
