/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Rwanda REMA data source.
 */

import { DateTime } from 'luxon';
import client from '../lib/requests.js';
import log from '../lib/logger.js';

export const name = 'rwanda-rema';

export function fetchData(source, cb) {
  client(source.url)
    .then(response => {
      const data = JSON.parse(response.body);
      const formattedData = formatData(data.features);
      log.debug(formattedData);
      if (!formattedData) {
        throw new Error('Failure to parse data.');
      }
      cb(null, formattedData);
    })
    .catch(error => {
      cb(error);
    });
}

const formatData = function(features) {
  let measurements = [];

  features.forEach(feature => {
    const { geometry, properties } = feature;
    const { coordinates } = geometry;
    const longitude = coordinates[0];
    const latitude = coordinates[1];

    properties.data.forEach(dataItem => {
      Object.entries(dataItem).forEach(([key, value]) => {
        if (['CO', 'NO2', 'O3', 'PM10', 'PM25', 'SO2'].includes(key)) {
          const utcTime = DateTime.fromISO(dataItem.time, { zone: 'utc' });
          const localTime = utcTime.setZone('Africa/Kigali');

          measurements.push({
            location: properties.title,
            city: ' ',
            parameter: key.toLowerCase(),
            value: value,
            unit: (key === 'PM10' || key === 'PM2.5') ? 'µg/m³' : 'ppm',
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
                  url: "https://aq.rema.gov.rw/",
                },
              ],
              averagingPeriod: {
                unit: 'hours',
                value: 1,
              },
          });
        }
      });
    });
  });

  const filteredMeasurements = measurements.filter(m => m.value !== 0 && m.value !== null);
  return { measurements: filteredMeasurements };
};
