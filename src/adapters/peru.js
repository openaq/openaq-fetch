/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the OEFA Peru data source.
 */

import got from 'got';
import { DateTime } from 'luxon';
import log from '../lib/logger.js';

export const name = 'peru';

const nowUTC = DateTime.utc().toISODate()

const pollutants = [ // all available parameters
  'pm10',
  'pm25',
  'so2',
  // 'h2s',
  'co',
  'no2',
  // 'pbar',
  // 'pp',
  // 'temp',
  // 'hr',
  // 'ws',
  // 'wd',
  // 'rs',
];

export async function fetchData (source, cb) {
  try {
    const stationIds = Array.from({ length: 60 }, (_, i) => i + 1);

    const postResponses = stationIds.map((id) =>
      createRequest(id, source)
    );

    const results = await Promise.all(postResponses);

    let allMeasurements = [];
    results.forEach((result) => {
      if (result) {
        const measurements = formatData(result);
        allMeasurements = allMeasurements.concat(measurements);
      }
    });

    log.debug('All measurements:', allMeasurements);
    cb(null, { name: 'unused', measurements: allMeasurements });
  } catch (error) {
    cb(error);
  }
}

function formatData (data) {
  const measurements = [];
  
  const { coordinates, date } = data.lastDataObject;
  const formattedDate = date.replace(' ', 'T').replace(' UTC', 'Z');
  const dateLuxon = DateTime.fromISO(formattedDate);

  pollutants.forEach((pollutant) => {
    if (data.lastDataObject.hasOwnProperty(pollutant)) {
      const value = data.lastDataObject[pollutant];
      if (value !== null) {
        measurements.push({
          date: {
            utc: dateLuxon.toUTC().toISO({ suppressMilliseconds: true}),
            local: dateLuxon.setZone('America/Lima').toISO({ suppressMilliseconds: true}),
          },
          location: data.lastDataObject.station,
          city: data.lastDataObject.district,
          coordinates: {
            latitude: parseFloat(coordinates.latitude),
            longitude: parseFloat(coordinates.longitude),
          },
          parameter: pollutant,
          value: parseFloat(value),
          unit: 'µg/m³',
          averagingPeriod: { unit: 'minutes', value: 5 },
          attribution: [{ name: 'OEFA', url: 'https://www.gob.pe/oefa' }],
        });
      }
    }
  });

  return measurements;
}

async function createRequest(idStation, source) {
  const body = {
    user: process.env.OEFA_USER,
    password: process.env.OEFA_PASSWORD,
    startDate: nowUTC,
    endDate: nowUTC,
    idStation: idStation.toString(),
  };

  try {
    const response = await got.post(source.url, {
      json: body,
      responseType: 'json',
    });

    // Check if response body 'status' is not "1"; ie user or password is incorrect
    if (response.body.status !== "1") {
      throw new Error(`API Error for station ID ${idStation}: ${response.body.message || 'Unknown error'}`);
    }

    if (!response.body.data || response.body.data.length === 0) {
      log.debug(`No data for station ID ${idStation}`);
      return null;
    } else {
      return {
        idStation,
        lastDataObject: response.body.data[response.body.data.length - 1],
      };
    }
  } catch (error) {
    log.error(
      `Request failed for station ID ${idStation}:`,
      error.response ? error.response.body : error.message
    );
    throw error;
  }
}
