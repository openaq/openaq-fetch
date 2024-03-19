/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Thailandian data source.
 */

'use strict';

import { DateTime } from 'luxon';
import client from '../lib/requests.js';
import {
  unifyParameters,
  unifyMeasurementUnits,
} from '../lib/utils.js';

export const name = 'air4thai';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export function fetchData (source, cb) {
  client({ url: source.url })
    .then((data) => {

      const formattedData = formatData(data);

      if (formattedData === undefined) {
        throw new Error('Failure to parse data.');
      }
      cb(null, formattedData);
    })
    .catch((error) => {
      cb(error);
    });
}

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standardized data our system can use
 */

const formatData = function (data) {
  let measurements = [];

  data.stations.forEach((item) => {
    const city = String(item.areaEN).split(',');
    const dateLuxon = DateTime.fromFormat(
      item.AQILast.date + ' ' + item.AQILast.time,
      'yyyy-MM-dd HH:mm',
      { zone: 'Asia/Bangkok' }
    );
    const base = {
      location: item.nameEN.trim(),
      city: city[city.length - 1].trim(),
      date: {
        utc: dateLuxon.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
        local: dateLuxon.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
      },
      coordinates: {
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.long),
      },
      attribution: [
        { name: 'Air4Thai', url: 'http://air4thai.pcd.go.th/webV2/' },
      ],
    };
    Object.keys(item.AQILast).forEach((v) => {
      const unaccepted = ['date', 'AQI', 'time'];
      const unit = {
        PM25: 'µg/m³',
        PM10: 'µg/m³',
        O3: 'ppb',
        CO: 'ppm',
        NO2: 'ppb',
        SO2: 'ppb',
      };
      const average = {
        PM25: 24,
        PM10: 24,
        O3: 8,
        CO: 8,
        NO2: 1,
        SO2: 1,
      };
      if (!unaccepted.includes(v)) {
        let m = Object.assign(
          {
            unit: unit[v],
            value: parseFloat(item.AQILast[v].value),
            parameter: v,
            averagingPeriod: { unit: 'hours', value: average[v] },
          },
          base
        );
        m = unifyMeasurementUnits(unifyParameters(m));
        if (m.value >= 0) {
          measurements.push(m);
        }
      }
    });
  });

  return { name: 'unused', measurements: measurements };
};
