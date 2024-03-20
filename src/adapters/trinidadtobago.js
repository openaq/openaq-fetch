/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for data sources for Trindidad and Tobago
 * adapted from magnus' code @magsyg PR #754 OpenAQ Fetch repo
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */

'use strict';

import log from '../lib/logger.js';
import _ from 'lodash';
import { DateTime } from 'luxon';
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
// stations and IDs are referred to here but coordinates must be added manually
// "https://ei.weblakes.com/RTTPublic/SelectCode/ThemeGridData?aThemeName=AMBIENTSITE&aParentKey=-1&aBriefGrid=True&aSelectedKeysProviderId=&aNavView=&anEntity=50&gridId=SelectCode_AMBIENTSITE&Context_Bootstrap_Flag=true&_search=false&nd=1710968481872&rows=20&page=1&sidx=&sord=asc&ssSearchField=__ANY_COLUMN&ssSearchOper=cn&ssSearchString=&_=1710968480622"
const stations = [
  {
    key: '16',
    city: 'Couva',
    location: 'Point Lisas',
    latitude: 10.41603,
    longitude: -61.47468,
  },
  {
    key: '18',
    city: ' ',
    location: 'EMA Shelter (Point Lisas - OLD)', // !!
    latitude: 10.41603,
    longitude: -61.47468,
  },
  {
    key: '53',
    city: ' ',
    location: 'Mayaro AAQMS',
    latitude: 10.28850,
    longitude: -61.00689,
  },
  // no data for this station as of March 20, 2024
  // {
  //   key: '54',
  //   city: '',
  //   location: 'Toco AAQMS',
  //   latitude: 10.41603,
  //   longitude: -61.47468,
  // },
  {
    key: '19',
    city: 'Port of Spain',
    location: 'Port of Spain',
    latitude: 10.64256,
    longitude: -61.49406,
  },
  {
    key: '57',
    city: 'Tobago',
    location: 'Scaroborough',
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
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
export async function fetchData(source, cb) {
    // Fetch both the measurements and meta-data about the locations
    // Loops through all the stations, and then loops through all parameters IDS
    // and adds the requests to the tasks
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
    const data = formatData(results);
    log.debug('first row of data', data[0]);
    return cb(null, data);
  } catch (e) {
    return cb({ message: `Unknown adapter error - ${e.message}` });
  }
}


/**
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standardized data our system can use
 */
const formatData = function (results) {
  let measurements = [];

  results.forEach(({ meta, values }) => {
    Object.keys(values).forEach(key => {
      // Check if the key is one of our known parameters
      if (parameters[key]) {
        const parameterInfo = parameters[key];
        const parameterData = values[key];
        const labels = values.xlabels;

        // Proceed if we have data and labels to work with
        if (parameterData && labels && parameterData.length === labels.length) {
          parameterData.forEach((value, index) => {
            if (value !== null) {
              const template = {
                city: meta.city,
                location: meta.location,
                parameter: parameterInfo.name,
                unit: parameterInfo.unit,
                coordinates: {
                  latitude: parseFloat(meta.latitude),
                  longitude: parseFloat(meta.longitude),
                },
                attribution: [{
                  name: 'Trinidad and Tobago Environmental Management Authority',
                  url: 'https://ei.weblakes.com/RTTPublic/DshBrdAQI',
                }],
                averagingPeriod: { unit: 'hours', value: 1 },
              };

              let measurement = { ...template, value };

              const dateMoment = DateTime.fromFormat(labels[index], 'yyyy-MM-dd HH-mm', { zone: 'America/Port_of_Spain' });
              measurement.date = {
                utc: dateMoment.toUTC().toISO({ suppressMilliseconds: true }),
                local: dateMoment.toISO({ suppressMilliseconds: true }),
              };

              measurements.push(measurement);
            }
          });
        } else {
          log.warn(`Incomplete or inconsistent data for parameter: ${key} at station: ${meta.city}, ${meta.location}.`);
        }
      }
    });
  });

  return {
    name: 'unused',
    measurements: measurements,
  };
};
