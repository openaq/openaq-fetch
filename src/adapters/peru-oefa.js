/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the OEFA Peru data source.
 */

import got from 'got';
import { DateTime } from 'luxon';
import log from '../lib/logger.js';

export const name = 'peru-oefa';

export async function fetchData (source, cb) {
  try {
    const data = await findStationsWithData(source);
    cb(null, data);
  } catch (error) {
    cb(error);
  }
}

function createMeasurements (data) {
  const pollutants = [
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

  const measurements = [];
  const latitude = parseFloat(data.coordinates.latitude);
  const longitude = parseFloat(data.coordinates.longitude);
  const dateFormatter = (dateString) => {
    const customFormat = "yyyy-MM-dd HH:mm:ss 'UTC'";
    const utcTime = DateTime.fromFormat(dateString, customFormat);
    return utcTime;
  };
  for (const pollutant of pollutants) {
    if (data.hasOwnProperty(pollutant)) {
      const measurement = {
        date: {
          utc: dateFormatter(data.date).toFormat(
            "yyyy-MM-dd'T'HH:mm:ss'Z'"
          ),
          local: dateFormatter(data.date)
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

async function checkDataForStation (idStation, source) {
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
      // Return the last object in the 'data' array
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

// this should be updated when we know more about the stations
async function findStationsWithData (source) {
  const stationIds = Array.from({ length: 30 }, (_, i) => i + 1);
  const stationChecks = stationIds.map((idStation) =>
    checkDataForStation(idStation, source)
  );
  const results = await Promise.all(stationChecks);

  let allMeasurements = [];

  results
    .filter((result) => result !== null)
    .forEach((result) => {
      const measurements = createMeasurements(result.lastDataObject);
      allMeasurements = allMeasurements.concat(measurements);
    });

  log.debug('All measurements:', allMeasurements);
  return { name: 'unused', measurements: allMeasurements };
}
