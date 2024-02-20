/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the OEFA Peru data source.
 */

import got from 'got';

import { DateTime } from 'luxon';
import log from '../lib/logger.js';

export const name = 'peru';

const gotExtended = got.extend({
  retry: { limit: 3 },
  timeout: { request: 120000 },
});
// Available parameters for the pollutants we are interested in.
const pollutants = [
  'pm10',
  'pm25',
  'so2',
  'co',
  'no2',
];

export async function fetchData(source, cb) {
  try {
    let stationIds = [...Array(35).keys()].map(i => i + 1);
    log.debug(`Fetching data for station IDs: ${stationIds.join(', ')}`);
    
    const postResponses = stationIds.map((id) =>
      createRequests(id, source)
    );

    const results = await Promise.all(postResponses);

    let allMeasurements = [];
    log.info('Processing results...');
    
    results.forEach((result, index) => {
      if (result !== null) {
        log.info(`Formatting data for station ID: ${stationIds[index]}`);
        const measurements = formatData(result.lastDataObject);
        allMeasurements = allMeasurements.concat(measurements);
      } else {
        log.warn(`No data received for station ID: ${stationIds[index]}`);
      }
    });

    log.debug('All measurements compiled.', allMeasurements.length);
    cb(null, { name: 'unused', measurements: allMeasurements });
  } catch (error) {
    log.error('Error in fetchData:', error.message);
    cb(error);
  }
}

function formatData(data) {
  const measurements = [];
  const latitude = parseFloat(data.coordinates.latitude);
  const longitude = parseFloat(data.coordinates.longitude);

  pollutants.forEach((pollutant) => {
    if (data[pollutant] !== null) {
      const measurement = {
        date: {
          utc: DateTime.fromISO(data.date).toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
          local: DateTime.fromISO(data.date).setZone('America/Lima').toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
        },
        location: data.station,
        city: data.province,
        coordinates: { latitude, longitude },
        parameter: pollutant,
        value: parseFloat(data[pollutant]),
        unit: 'µg/m³',
        averagingPeriod: { unit: 'minutes', value: 5 },
        attribution: [
          { name: 'OEFA', url: 'https://www.gob.pe/oefa' },
        ],
      };
      measurements.push(measurement);
    }
  });

  return measurements;
}

async function createRequests(idStation, source) {
  const body = {
    user: "OPENAQ",
    password: "see-docs-for-password",
    startDate: "2024-10-12",
    endDate: "2024-10-13",
    // idStation: idStation.toString()
    idStation: 2
  };

  try {
    log.info(`Sending request for station ID: ${idStation}`);
    const response = await gotExtended.post(source.url, {
      json: body,
      responseType: 'json',
    });

    const data = response.body.data;
    if (data && data.length > 0) {
      log.info(`Data received for station ID: ${idStation}`);
      return { idStation, lastDataObject: data[data.length - 1] };
    } else {
      log.warn(`No data found for station ID: ${idStation}`);
      return null;
    }
  } catch (error) {
    log.error(`Error for station ID ${idStation}: ${error.response?.body || error.message}`);
    return null;
  }
}
