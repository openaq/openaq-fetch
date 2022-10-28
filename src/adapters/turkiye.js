/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Turkiye data sources.
 */

'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as baseRequest } from 'request';
import { DateTime } from 'luxon';
import flatten from 'lodash/flatten.js';
import { parse } from 'wellknown';
const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });

export const name = 'turkiye';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export function fetchData (source, cb) {
  request(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({ message: 'Failure to load data url' });
    }
    try {
      const res = JSON.parse(body);
      const data = formatData(res.objects);

      if (data === undefined) {
        return cb({ message: 'Failure to parse data.' });
      }
      return cb(null, data);
    } catch (e) {
      return cb(e);
    }
  });
};

const validParameters = {
  PM25: { value: 'pm25', unit: 'µg/m³' },
  PM10: { value: 'pm10', unit: 'µg/m³' },
  O3: { value: 'o3', unit: 'µg/m³' },
  SO2: { value: 'so2', unit: 'µg/m³' },
  NO2: { value: 'no2', unit: 'µg/m³' },
  CO: { value: 'co', unit: 'mg/m³' }
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */

function formatData (locations) {
  let out = [];
  for (const location of locations) {
    let coords = parse(location['Location']).coordinates;
    const filtered = Object.entries(location['Values'])
      .filter(([key, _]) => {
        return key in validParameters;
      })
      // filter out null values
      .filter((o) => o[1])
      // map to the correct format
      .map((o) => {
        return {
          parameter: validParameters[o[0]].value,
          unit: validParameters[o[0]].unit,
          value: o[1]
        };
      });
    const data = filtered.map((tr) => {
      return {
        location: location.Name,
        city: location.City_Title,
        value: tr.value,
        unit: tr.unit,
        parameter: tr.parameter,
        date: {
          // time in Turkey is UTC+3
          local: DateTime.fromISO(location.Values.Date, {
            zone: 'Europe/Istanbul'
          }).toISO({ suppressMilliseconds: true }),
          utc: DateTime.fromISO(location.Values.Date, {
            zone: 'Europe/Istanbul'
          })
        },
        coordinates: {
          latitude: coords[1],
          longitude: coords[0]
        },
        attribution: [
          {
            name: 'T.C. Çevre ve Şehircilik Bakanlığı',
            url: 'https://sim.csb.gov.tr/SERVICES/airquality'
          }
        ],
        averagingPeriod: { unit: 'hours', value: 1 }
      };
    });
    out.push(data);
  }
  return { name: 'unused', measurements: flatten(out) };
}
