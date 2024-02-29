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
		// because we have do not have the ability to query the api
		// to see how many stations we have we will create them this way
		// the station count will be stored in the source config
		let n = source.stationCount || 1;
    let stationIds = [...Array(n).keys()].map(i => i + 1);
    log.debug(`Fetching data for station ids up to ${n}`);

		if(!source.from) {
				source.from = DateTime.utc().toISODate();
		}
		if(!source.to) {
				source.to = DateTime.utc().toISODate();
		}

    const postResponses = stationIds.map((id) =>
				createRequests(id, source)
    );

    const results = await Promise.all(postResponses);

    let allMeasurements = [];
    log.debug('Processing results...');

    results.forEach((result, index) => {
      if (result !== null) {
        log.debug(`Formatting data for station ID: ${stationIds[index]}`);
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
    user: source.user,
    password: source.password,
    startDate: source.from,
    endDate: source.to,
    idStation: idStation.toString()
  };

  try {
    log.debug(`Sending request for station ID: ${idStation} (${source.from} - ${source.to})to ${source.url}`);
    const response = await gotExtended.post(source.url, {
      json: body,
      responseType: 'json',
    });
    const data = response.body.data;
    if (data && data.length > 0) {
      log.debug(`Data received for station ID: ${idStation}`);
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
