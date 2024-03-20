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
//import got from 'got';
import client from '../lib/requests.js';
import tough from 'tough-cookie';

export const name = 'trinidadtobago';
export const parameters = {
    'Carbon Monoxide': { name: 'co', unit: 'mg/m3', id: '3' },
    'Nitrogen Dioxide Concentrations [µg_m³]': { name: 'no2', unit: 'ug/m3', id: '1465' },
    'Ozone Concentrations [µg/m³]': { name: 'o3', unit: 'ug/m3', id: '2130' },
    'Particulate Matter < 10µ': { name: 'pm10', unit: 'ug/m3', id: '18' },
    'Particulate Matter < 2.5µ': { name: 'pm25', unit: 'ug/m3', id: '20' },
    'Sulfur Dioxide Concentrations [µg_m³]': { name: 'so2', unit: 'ug/m3', id: '23' }
};

const timestamp = DateTime.now().toMillis();
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



/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export async function fetchData(source, cb) {
  // Fetch both the measurements and meta-data about the locations
  // List of keys for parameters used in url [3: 'CO', 1465: 'NO2', 2130: 'O3', 18: 'PM-10', 20: 'PM-2.5', 23: 'SO2']

    // Loops through all the stations, and then loops through all parameters IDS
    //, and adds the requests to the tasks
    const tasks = [];
    stations.map( meta => {
        Object.values(parameters).map( parameter => {
            const sourceURL =
                  source.url
                  .replace('$station', meta.key)
                  .replace('$parameter', parameter.id) + timestamp;

            const task = async () => {
                try {
                    const values = await client({
                        url: sourceURL,
                        cookieJar: new tough.CookieJar(),
                    });

                    return { meta, values, parameter };
                } catch (err) {
                    throw new Error(`fetchData error: ${err.message}`);
                }
            };
            tasks.push(task);
        });
    });

  try {

    const results = await Promise.all(tasks.map((task) => task()));
    // Format the data
    const data = formatData(results, cb);
    return cb(null, data);
  } catch (e) {
    return cb({ message: `Unknown adapter error - ${e.message}` });
  }
}


/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */

const formatData = function (results, cb) {
  let measurements = [];

    // each item is a measurement from one station
    // so if one part of that measurment is bad the whole item is bad
    results.forEach((item) => {
        try {
            // find a match in the data to one of our parameters
            let parameter = Object.keys(parameters).find((p) =>
                item.values.hasOwnProperty(p)
            );

            if (!parameter) {
                throw new Error(
                    `Could not find a valid parameter in [${Object.keys(item.values)}]. It is possible that the source names have changed.`
                );
            } else if (item.values[parameter].length !== item.values.xlabels.length) {
                throw new Error(`Source data for ${parameter} does not seem to have matching labels`);
            }

            const template = {
                city: item.meta.city,
                location: item.meta.location,
                parameter: parameters[parameter].name,
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
                unit: parameters[parameter].unit
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

                    m = unifyParameters(m);
                    m = unifyMeasurementUnits(m);
                    measurements.push(m);
                }
            });
        } catch (err) {
            // log the error but dont throw
            log.warn(`Formatting error: ${err.message}`);
        }
    });

 // measurements = getLatestMeasurements(measurements);

  return {
    name: 'unused',
    measurements: measurements,
  };
};


// Could we remove this? Or if its limiting to a specific period could we do it better?
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
