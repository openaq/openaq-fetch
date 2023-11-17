/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the OEFA Peru data source.
 */

import got from 'got';
import { DateTime } from 'luxon';
import log from '../lib/logger.js';

export const name = 'peru-oefa';

const pollutants = [ // available parameters
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
    // const stationIds = Array.from({ length: 30 }, (_, i) => i + 1);
    const stationIds = [
      2, 4, 5, 7, 9, 10, 11, 12, 13, 19, 22, 23, 24, 25, 26, 27, 28,
      29, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 47, 48, 49, 50, 51,
      52,
    ];

    const postResponses = stationIds.map((id) =>
      createRequests(id, source)
    );

    const results = await Promise.all(postResponses);

    let allMeasurements = [];

    results
      .filter((result) => result !== null)
      .forEach((result) => {
        const measurements = formatData(result.lastDataObject);
        allMeasurements = allMeasurements.concat(measurements);
      });

    log.debug('All measurements:', allMeasurements);
    cb(null, { name: 'unused', measurements: allMeasurements });
  } catch (error) {
    log.error('Error in fetchData:', error);
    cb(error);
  }
}

function formatData (data) {
  const measurements = [];

  const latitude = parseFloat(data.coordinates.latitude);
  const longitude = parseFloat(data.coordinates.longitude);

  const dateLuxon = (dateString) => {
    const customFormat = "yyyy-MM-dd HH:mm:ss 'UTC'";
    const utcTime = DateTime.fromFormat(dateString, customFormat);
    return utcTime;
  };

  for (const pollutant of pollutants) {
    if (data.hasOwnProperty(pollutant)) {
      const measurement = {
        date: {
          utc: dateLuxon(data.date).toFormat(
            "yyyy-MM-dd'T'HH:mm:ss'Z'"
          ),
          local: dateLuxon(data.date)
            .setZone('America/Lima')
            .toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
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
  }

  return measurements;
}

async function createRequests (idStation, source) {
  const body = {
    usuario: 'OPENAQ',
    clave: 'OPENAQ',
    fechaInicio: '',
    fechaFinal: '',
    idStation: idStation.toString(),
  };

  try {
    const response = await got.post(source.url, {
      json: body,
      responseType: 'json',
    });

    const data = response.body.data;
    if (data && data.length > 0) {
      return { idStation, lastDataObject: data[data.length - 1] };
    }
    return null;
  } catch (error) {
    log.error(
      `Error for idStation ${idStation}:`,
      error.response.body
    );
    return null;
  }
}
