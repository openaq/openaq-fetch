'use strict';

import { default as moment } from 'moment-timezone';
import { acceptableParameters, promiseRequest } from '../lib/utils';

export const name = 'ust-ist';

export async function fetchData (source, cb) {
  try {
    const data = JSON.parse(await promiseRequest(source.url));

    // Generate an array of station ID
    const stations = Object.keys(data);

    const measurements = stations.reduce((acc, stationId) => {
      const station = data[stationId];

      // Only interested in 1 hour resolution.
      if (station.resolution !== '1h') return acc;

      const baseMeta = {
        location: station.name,
        city: '',
        averagingPeriod: { value: 1, unit: 'hours' },
        coordinates: { latitude: 0, longitude: 0 }
      };

      const latestMeasurements = parseParams(station.parameters);

      return acc.concat(latestMeasurements
        .map(m => ({ ...baseMeta, ...m }))
      );
    }, []);
    cb(null, {name: 'unused', measurements});
  } catch (e) {
    cb(e);
  }
}

/**
 * Parse object with parameters, each with a series of measurements.
 * Return an array with the latest measurement for valid parameters only.
 *
 * @param {object} params Parameter object
 *
 * @example parseParams({
 *   'NO': [
 *     { endtime: '2020-01-03 03:00:00', value: '0.2175', verification: 3 },
 *     { endtime: '2020-01-03 02:00:00', value: '0.25', verification: 3 }
 *   ],
 *   'NO2': [
 *     { endtime: '2020-01-03 03:00:00', value: '0.154717', verification: 3 },
 *     { endtime: '2020-01-03 02:00:00', value: '0.13522', verification: 3 }
 *   ]
 * })
 *
 * @returns [ { value: 0.154717, date: 2020-01-03 03:00:00. parameter: 'no2' }]
 *
 */

function parseParams (params) {
  // Array with the valid parameters in the object
  const validParams = Object.keys(params).filter(p => acceptableParameters.includes(p.toLowerCase()));

  return validParams.map(p => {
    // Assumes that array is always sorted
    const latestM = params[p][0];

    const date = moment.tz(latestM.endtime, 'Atlantic/Reykjavik');

    return {
      date: {
        utc: date.toDate(), // 2020-01-03T04:00:00.000Z
        local: date.format('YYYY-MM-DDTHH:mm:ssZ') // '2020-01-03T04:00:00+00:00'
      },
      parameter: p.toLowerCase(),
      value: Number(latestM.value),
      unit: ''
    };
  });
}
