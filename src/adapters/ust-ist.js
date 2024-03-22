/**
 * This adapter pulls AQ data for Iceland
 */

'use strict';

import { acceptableParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';
import client from '../lib/requests.js';
export const name = 'ust-ist';

export async function fetchData (source, cb) {
  try {
    const allData = await client({ url: source.url });

    const allMeta = await client({ url: 'https://api.ust.is/aq/a/getStations' });

    // Generate an array of station IDs there is data for.
    const stations = Object.keys(allData);

      const measurements = stations.reduce((acc, stationId) => {
          const stationData = allData[stationId];

          const stationMeta = allMeta.find(s => s.local_id === stationData.local_id);
          // if the line above does not find anything
          // this line below will fail
          // and that error will be caught outside of this loop
          // and so we will miss all of the data because of this one error
          const baseMeta = {
              location: stationData.name,
              city: stationMeta.municipality,
              coordinates: {
                  latitude: parseFloat(stationMeta.latitude),
                  longitude: parseFloat(stationMeta.longitude)
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

    const date = DateTime.fromFormat(latestM.endtime.trimEnd(), 'yyyy-LL-dd HH:mm:ss', { zone: 'Atlantic/Reykjavik' });

    // Resolution is reported as 1h. Anything else will break.
    const resolution = params[p].resolution === '1h'
      ? { value: 1, unit: 'hours' }
      : {};

    return {
      date: {
        utc: date.toUTC().toISO({ suppressMilliseconds: true }),
        local: date.toISO({ suppressMilliseconds: true })
      },
      parameter: p.toLowerCase().replace('.', ''),
      value: parseFloat(latestM.value),
      unit: params[p].unit,
      averagingPeriod: resolution
    };
  });
}
