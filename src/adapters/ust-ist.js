/**
 * This adapter pulls AQ data for Iceland
 */

'use strict';

import { acceptableParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';

import client from '../lib/requests.js';
import log from '../lib/logger.js';

export const name = 'ust-ist';

// a list of endpoints can be found at https://api.ust.is/aq/a
const stationsUrl = 'https://api.ust.is/aq/a/getStations';
const dataUrl = `https://api.ust.is/aq/a/getLatest`;

/**
 * Fetches air quality data for Iceland from a specific date and compiles it into a structured format.
 *
 * @param {Object} source - The source configuration object, including name and URL.
 * @param {Function} cb - A callback function that is called with the final dataset or an error.
 */
export async function fetchData(source, cb) {
    try {
      const headers =  {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        pragma: "no-cache"
    };
      const allData = await client({ url: dataUrl, headers: headers});
      const allMeta = await client({ url: stationsUrl, headers: headers});
      const stations = Object.keys(allData);

      const measurements = stations.reduce((acc, stationId) => {
        const stationData = allData[stationId];
        const stationMeta = allMeta.find(s => s.local_id === stationData.local_id);

        // Skip processing this station if metadata is missing
        if (!stationMeta) {
          log.warn(`Metadata missing for station ID: ${stationId}. Skipping...`);
          return acc;
        }

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
      log.debug("Example measurements", measurements.slice(-5));
      cb(null, { name: 'unused', measurements });
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
function parseParams(params) {
    // Array with the valid parameters in the object
    const validParams = Object.keys(params).filter(p => acceptableParameters.includes(p.toLowerCase().replace('.', '')));

    return validParams.flatMap(p => {
        const measurements = Object.keys(params[p])
              .filter(key => !isNaN(parseInt(key))) // Filter out keys that are not indices
              .map(index => {
                  const measurement = params[p][index];
                  // datetime for the measurement is 'time ending" using /getLatest endpoint
                  const date = DateTime.fromFormat(measurement.endtime.trimEnd(), 'yyyy-LL-dd HH:mm:ss', { zone: 'Atlantic/Reykjavik' });

                  const resolution = params[p].resolution === '1h'
                        ? { value: 1, unit: 'hours' }
                        : {};

                  return {
                      date: {
                          utc: date.toUTC().toISO({ suppressMilliseconds: true }),
                          local: date.toISO({ suppressMilliseconds: true })
                      },
                      parameter: p.toLowerCase().replace('.', ''),
                      value: parseFloat(measurement.value),
                      unit: params[p].unit,
                      averagingPeriod: resolution
                  };
              });

        return measurements;
    });
}
