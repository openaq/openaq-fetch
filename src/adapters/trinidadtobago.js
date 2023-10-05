/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for data sources for Trindidad and Tobago
 * adapted from magnus' code @magsyg PR #754 OpenAQ Fetch repo
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import {
  unifyParameters,
  unifyMeasurementUnits,
} from '../lib/utils.js';
import log from '../lib/logger.js';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import _ from 'lodash';
import { DateTime } from 'luxon';
import got from 'got';
import tough from 'tough-cookie';

export const name = 'trinidadtobago';

const timestamp = DateTime.now().toMillis();

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export async function fetchData(source, cb) {
  // Fetch both the measurements and meta-data about the locations
  // List of keys for parameters used in url [3: 'CO', 1465: 'NO2', 2130: 'O3', 18: 'PM-10', 20: 'PM-2.5', 23: 'SO2']
  const parameterIDs = ['3', '1465', '2130', '18', '20', '23'];
  const tasks = [];

  // Loops through all the stations, and then loops through all parameters IDS, and adds the requests to the tasks
  _.forEach(stations, function (e) {
    for (let i in parameterIDs) {
      const sourceURL =
        source.url
          .replace('$station', e.key)
          .replace('$parameter', parameterIDs[i]) + timestamp;
      const task = async function () {
        try {
          const { body } = await got(sourceURL, {
            cookieJar: new tough.CookieJar(),
            timeout: { request: REQUEST_TIMEOUT },
          });
          return { meta: e, values: body };
        } catch (err) {
          throw new Error(err.response.body);
        }
      };
      tasks.push(task);
    }
  });

  try {
    const results = await Promise.all(tasks.map((task) => task()));
    // Format the data
    const data = formatData(results);
    if (data === undefined) {
      return cb({ message: 'Failure to parse data.' });
    }
    cb(null, data);
  } catch (e) {
    return cb({ message: 'Unknown adapter error.' });
  }
}

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */

const formatData = function (results) {
  let measurements = [];
  /**
   * Formats the string result of values into JSON, or undefined if values are empty or something fails
   * @param {array} data Object of a combination of metadata and values
   * @return {object} Parsed values into JSON or unddefines if values are empty or something fails
   */
  const parseToJSON = (data) => {
    try {
      data.values = JSON.parse(data.values);
      if (Object.keys(data.values).length === 0) {
        data = undefined;
      }
    } catch (e) {
      data = undefined;
    }
    return data;
  };
  // Loops through all items
  const validParameters = ['CO', 'NO2', 'O3', 'PM-10', 'PM-2.5', 'SO2'];

  results.forEach((item) => {
    item = parseToJSON(item);

    if (item !== undefined) {
      // Identify the parameter
      let parameter = validParameters.find((p) =>
        item.values.hasOwnProperty(p)
      );

      // Check if parameter and xlabels have the same length
      if (
        !parameter ||
        item.values[parameter].length !== item.values.xlabels.length
      ) {
        log.info(
          'Parameter mismatch or length mismatch between readings and labels.',
          item
        );
        return;
      }

      const template = {
        city: item.meta.city,
        location: item.meta.location,
        parameter: parameter.toLowerCase(),
        coordinates: {
          latitude: parseFloat(item.meta.latitude),
          longitude: parseFloat(item.meta.longitude),
        },
        attribution: [
          {
            name: 'Trinidad and Tobago Environmental Management Authority',
            url: 'https://ei.weblakes.com/RTTPublic/DshBrdAQI',
          },
        ],
        averagingPeriod: { unit: 'hours', value: 1 },
        unit: parameter === 'CO' ? 'mg/m3' : 'ug/m3', // Units adjustment based on the parameter
      };

      item.values[parameter].forEach((value, i) => {
        if (value !== null) {
          let m = Object.assign({ value: value }, template);

          const dateMoment = DateTime.fromFormat(
            item.values.xlabels[i],
            'yyyy-MM-dd HH',
            { zone: 'America/Port_of_spain' }
          );
          m.date = {
            utc: dateMoment
              .toUTC()
              .toISO({ suppressMilliseconds: true }),
            local: dateMoment.toISO({ suppressMilliseconds: true }),
          };

          // unify parameters and measurement units
          m = unifyParameters(m);
          m = unifyMeasurementUnits(m);
          measurements.push(m);
        }
      });
    }
  });

  // corrects the parameter names
  measurements = correctMeasurementParameter(measurements);
  // filters out the measurements that are not the latest
  measurements = getLatestMeasurements(measurements);
  return {
    name: 'unused',
    measurements: measurements,
  };
};

function correctMeasurementParameter(measurements) {
  measurements.forEach((measurement) => {
    if (measurement.parameter === 'pm-10') {
      measurement.parameter = 'pm10';
    } else if (measurement.parameter === 'pm-25') {
      measurement.parameter = 'pm25';
    }
  });
  return measurements;
}

function getLatestMeasurements(measurements) {
  const latestMeasurements = {};

  measurements.forEach((measurement) => {
    const key = measurement.parameter + measurement.location;
    if (
      !latestMeasurements[key] ||
      measurement.date.local > latestMeasurements[key].date.local
    ) {
      latestMeasurements[key] = measurement;
    }
  });

  return Object.values(latestMeasurements);
}

const stations = [
  {
    key: '16',
    city: 'Couva',
    location: 'Point Lisas',
    latitude: 10.41603,
    longitude: -61.47468,
  },
  {
    key: '19',
    city: 'Port of Spain',
    location: 'Port of Spain',
    latitude: 10.64256,
    longitude: -61.49406,
  },
  {
    key: '47',
    city: 'Scaroborough',
    location: 'Signal Hill',
    latitude: 11.17455,
    longitude: -60.76007,
  },
  {
    key: '50',
    city: 'San Fernando',
    location: 'San Fernando',
    latitude: 10.26801,
    longitude: -61.46705,
  },
  {
    key: '52',
    city: 'Arima',
    location: 'Arima',
    latitude: 10.64849,
    longitude: -61.2844,
  },
];
