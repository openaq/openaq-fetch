/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Rwanda REMA data source.
 */

import { DateTime } from 'luxon';
import client from '../lib/requests.js';
import log from '../lib/logger.js';

export const name = 'rwanda-rema';
export const parameters = {
  CO: { name: 'co', unit: 'ppm' },
  NO2: { name: 'no2', unit: 'ppm' },
  O3: { name: 'o3', unit: 'ppm' },
  PM10: { name: 'pm10', unit: 'µg/m³' },
  PM25: { name: 'pm25', unit: 'µg/m³' },
  SO2: { name: 'so2', unit: 'ppm' },
};

/**
 * @param {Object} source - The data source, including the URL to fetch from.
 * @param {Function} cb - Callback function to handle the response or error.
 */
export function fetchData(source, cb) {
  // Potential error if data.features is undefined or not an array
  client({ url: source.url })
    .then((data) => {

      const formattedData = formatData(data.features);

      log.debug('First row of formatted:', formattedData.measurements.length && formattedData.measurements[0]);

	  if (!formattedData) {
        throw new Error('Failure to parse data.');
      }
      cb(null, formattedData);
    })
    .catch((error) => {
      cb(error);
    });
}

/**
 * @param {Array} features - Array of features from the raw data response.
 * @returns {Object} An object containing formatted air quality measurements.
 */
const formatData = function (features) {
  let measurements = [];

  features.forEach((feature) => {
    const { geometry, properties } = feature;
    const { coordinates } = geometry;
    const longitude = coordinates[0];
    const latitude = coordinates[1];

    properties.data.forEach((dataItem) => {
      Object.entries(dataItem).forEach(([key, value]) => {
        try { 
          if (value !== null && Object.keys(parameters).includes(key)) {
            const utcTime = DateTime.fromISO(dataItem.time, {
              zone: 'utc',
            });
            const localTime = utcTime.setZone('Africa/Kigali');
            const parameter = parameters[key];

            measurements.push({
              location: properties.title,
              city: ' ',
              parameter: parameter.name,
              value: value,
              unit: parameter.unit,
              date: {
                utc: utcTime.toISO({ suppressMilliseconds: true }),
                local: localTime.toISO({ suppressMilliseconds: true }),
              },
              coordinates: {
                latitude,
                longitude,
              },
              attribution: [
                {
                  name: 'Rwanda Environment Management Authority',
                  url: 'https://aq.rema.gov.rw/',
                },
              ],
              averagingPeriod: {
                unit: 'hours',
                value: 1,
              },
            });
          }
        } catch (error) { 
          log.error(`Error processing measurement for ${properties.title}: ${error}`);
        
        }
      });
    });
  });

  return { measurements: measurements };
};
