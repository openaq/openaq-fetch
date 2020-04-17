'use strict';

import { default as moment } from 'moment-timezone';
import { acceptableParameters, promiseRequest } from '../lib/utils';

export const name = 'ust-ist';

export async function fetchData (source, cb) {
  try {
    const allData = JSON.parse(await promiseRequest(source.url));
    const allMeta = JSON.parse(await promiseRequest('https://api.ust.is/aq/a/getStations'));

    // Generate an array of station IDs there is data for.
    const stations = Object.keys(allData);

    const measurements = stations.reduce((acc, stationId) => {
      const stationData = allData[stationId];
      const stationMeta = allMeta.find(s => s.local_id === stationData.local_id);

      const baseMeta = {
        location: stationData.name,
        city: stationMeta.municipality,
        coordinates: {
          latitude: Number(stationMeta.latitude),
          longitude: Number(stationMeta.longitude)
        },
        attribution: [{
          name: source.name,
          url: source.sourceURL
        }]
      };
      const latestMeasurements = parseParams(stationData.parameters);

      return acc.concat(latestMeasurements.map(m => ({ ...baseMeta, ...m })));
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
 *   'NO': {
 *     '0': { endtime: '2020-01-03 03:00:00', value: '0.2175', verification: 3 },
 *     '1': { endtime: '2020-01-03 02:00:00', value: '0.25', verification: 3 },
 *     'unit': 'µg/m3',
 *     'resolution': '1h'
 *   },
 *   'NO2': {
 *     '0': { endtime: '2020-01-03 03:00:00', value: '0.154717', verification: 3 },
 *     '1': { endtime: '2020-01-03 02:00:00', value: '0.13522', verification: 3 },
 *     'unit': 'µg/m3',
 *     'resolution': '1h'
 *   }
 * })
 *
 * @returns [ { value: 0.154717, date: 2020-01-03 03:00:00. parameter: 'no2' }]
 *
 */

function parseParams (params) {
  // Array with the valid parameters in the object
  const validParams = Object.keys(params).filter(p => acceptableParameters.includes(p.toLowerCase().replace('.', '')));

  return validParams.map(p => {
    // Assumes that '0' is always latest
    const latestM = params[p]['0'];

    const date = moment.tz(latestM.endtime, 'Atlantic/Reykjavik');

    // Resolution is reported as 1h. Anything else will break.
    const resolution = params[p].resolution === '1h'
      ? { value: 1, unit: 'hours' }
      : {};

    return {
      date: {
        utc: date.toDate(), // 2020-01-03T04:00:00.000Z
        local: date.format('YYYY-MM-DDTHH:mm:ssZ') // '2020-01-03T04:00:00+00:00'
      },
      parameter: p.toLowerCase().replace('.', ''),
      value: Number(latestM.value),
      unit: params[p].unit,
      averagingPeriod: resolution
    };
  });
}
