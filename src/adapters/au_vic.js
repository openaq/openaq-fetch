'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { unifyMeasurementUnits } from '../lib/utils.js';

import got from 'got';
import _ from 'lodash';
import { DateTime } from 'luxon';
import parallelLimit from 'async/parallelLimit.js';
import Bottleneck from 'bottleneck';

const request = got.extend({ timeout: { request: REQUEST_TIMEOUT } });

// Default rate limiting on API is set to 5 requests/sec.
// > Please send an email to Tools.support@epa.vic.gov.au with subject
// > 'EPA API Access Request: Increase rate-limiting' and a justified
// > reason if you want to get it increased for your subscriptions.
const maxRequestsPerSecond = 5;
const limiter = new Bottleneck({
  reservoir: maxRequestsPerSecond, // allow 5 requests
  reservoirRefreshAmount: maxRequestsPerSecond,
  reservoirRefreshInterval: 1000, // every 1000ms
  maxConcurrent: 1,
  minTime: (1000 / maxRequestsPerSecond) + 50 // to stagger requests out through each second adding a 50ms buffer
});

export const name = 'victoria';

export function fetchData(source, cb) {
  limiter.schedule(async () => {
    try {
      const response = await request(source.url, {
        headers: {
          'X-API-Key': process.env.EPA_VICTORIA_TOKEN
        }
      });
      const body = response.body;

      // Wrap everything in a try/catch in case something goes wrong
      try {
        // Format the data
        formatData(body, function (err, data) {
          // Make sure the data is valid
          if (err || data === undefined) {
            return cb({ message: 'Failure to parse data.' });
          }
          cb(null, data);
        });
      } catch (e) {
        return cb({ message: 'Unknown adapter error.' });
      }
    } catch (error) {
      return cb({ message: 'Failure to load data url.' });
    }
  });
}

const parameters = {
  'PM2.5': 'pm25',
  'PM10': 'pm10',
  'NO2': 'no2',
  'SO2': 'so2',
  'O3': 'o3',
  'CO': 'co',
  'BC': 'bc'
};

const units = {
  '&micro;g/m&sup3;': 'µg/m³',
  'ppm': 'ppm',
  'ppb': 'ppb'
};

// hardcoded mapping of location name -> city
const cities = {
  'Coolaroo': 'Melbourne',
  'Dallas': 'Melbourne',
  'Macleod': 'Melbourne',
  'Alphington': 'Melbourne',
  'Footscray': 'Melbourne',
  'Brooklyn': 'Melbourne',
  'Melbourne CBD': 'Melbourne',
  'Box Hill': 'Melbourne',
  'Brighton': 'Melbourne',
  'Dandenong': 'Melbourne',
  'Mooroolbark': 'Melbourne',
  'Geelong South': 'Geelong',
  'Morwell South': 'Morwell',
  'Morwell East': 'Morwell'
};

const formatData = function (data, formatDataCB) {
  let sites = JSON.parse(data).records;

  // request measurements from each site
  const tasks = sites.map(function (site) {
      return function (cb) {
        limiter.schedule(async () => {
          try {
            const response = await request(`https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1/sites/${site.siteID}/parameters`, {
              headers: {
                'X-API-Key': process.env.EPA_VICTORIA_TOKEN
              }
            });
            const body = response.body;
            const source = JSON.parse(body);

            // base properties shared for all measurements at this site
            const baseProperties = {
              location: source.siteName,
              city: cities[source.siteName] || source.siteName,
              country: 'AU',
              sourceName: source.name,
              sourceType: 'government',
              attribution: [{
                name: 'EPA Victoria State Government of Victoria',
                url: 'https://www.epa.vic.gov.au/EPAAirWatch'
              }],
              coordinates: {
                latitude: source.geometry.coordinates[0],
                longitude: source.geometry.coordinates[1]
              }
            };

            // list of all measurements at this site
            let measurements = [];
            if (source && source.parameters) {
              measurements = source.parameters.map(function (parameter) {
                if (parameter.name in parameters) {
                  const measurement = _.cloneDeep(baseProperties);
                  measurement.parameter = parameters[parameter.name];

                  // from the range of time series readings, find the 1HR_AV one
                  const averageReadings = parameter.timeSeriesReadings.filter(function (timeSeriesReading) {
                    return timeSeriesReading.timeSeriesName === '1HR_AV';
                  });

                  if (averageReadings.length && averageReadings[0].readings.length) {
                    const reading = averageReadings[0].readings[0];
                    if (reading.unit in units) {
                      measurement.unit = units[reading.unit];
                    measurement.averagingPeriod = { value: 1, unit: 'hours' };
                      measurement.value = Number(reading.averageValue);

                      const date = DateTime.fromISO(reading.until, { zone: 'Australia/Melbourne' });
                      measurement.date = {
                        utc: date.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
                        local: date.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ")
                      };

                      return unifyMeasurementUnits(measurement);
                    }
                  }
                }
              }).filter(function (measurement) {
                return measurement !== null;
              });
            }

            cb(null, measurements);
          } catch (error) {
            console.error(error, response);
            return cb({ message: 'Failure to load data url.' });
          }
        });
      };
  });

  parallelLimit(tasks, 1, function (err, measurements) {
    formatDataCB(err, { name: 'unused', measurements: _.flatten(measurements) });
  });
};
