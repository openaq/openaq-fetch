/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Turkiye data sources.
 */

'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import got from 'got';
import { DateTime } from 'luxon';
import flatten from 'lodash/flatten.js';
import { parse } from 'wellknown';

const gotExtended = got.extend({
  retry: { limit: 3 },
  timeout: { request: REQUEST_TIMEOUT },
});

export const name = 'turkiye';

export function fetchData (source, cb) {
/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
  gotExtended(source.url)
    .then(response => {
      if (response.statusCode !== 200) {
        cb(new Error('Failure to load data url'));
      } else {
        const res = JSON.parse(response.body);
        const data = formatData(res.objects);

        if (data === undefined) {
          cb(new Error('Failure to parse data.'));
        } else {
          console.dir(data, {depth:null})
          cb(null, data);
        }
      }
    })
    .catch(error => {
      cb(error);
    });
}

const validParameters = {
  PM25: { value: 'pm25', unit: 'µg/m³' },
  PM10: { value: 'pm10', unit: 'µg/m³' },
  O3: { value: 'o3', unit: 'µg/m³' },
  SO2: { value: 'so2', unit: 'µg/m³' },
  NO2: { value: 'no2', unit: 'µg/m³' },
  CO: { value: 'co', unit: 'µg/m³' },
};

function formatData (locations) {
/**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
  let out = [];
  for (const location of locations) {
    const coords = parse(location.Location).coordinates;
    const filtered = Object.entries(location.Values)
      .filter(([key, _]) => {
        return key in validParameters;
      })
      // filter out null values
      // .filter((o) => o[1])
      .filter(([key, value]) => value != null)

      // map to the correct format
      .map((o) => {
        return {
          parameter: validParameters[o[0]].value,
          unit: validParameters[o[0]].unit,
          value: o[1],
        };
      });
    let data = filtered.map((tr) => {
      return {
        location: location.Name,
        city: location.City_Title,
        value: tr.value,
        unit: tr.unit,
        parameter: tr.parameter,
        date: {
          // time in Turkey is UTC+3
          local: DateTime.fromISO(location.Values.Date, {
            zone: 'Europe/Istanbul',
          }).toISO({ suppressMilliseconds: true }),
          utc: DateTime.fromISO(location.Values.Date, {
            zone: 'Europe/Istanbul',
          })
            .toUTC()
            .toISO({ suppressMilliseconds: true }),
        },
        coordinates: {
          latitude: coords[1],
          longitude: coords[0],
        },
        attribution: [
          {
            name: 'T.C. Çevre ve Şehircilik Bakanlığı',
            url: 'https://sim.csb.gov.tr/SERVICES/airquality',
          },
        ],
        averagingPeriod: { unit: 'hours', value: 1 },
      };
    });
    out.push(data);
  }
  return { name: 'unused', measurements: flatten(out) };
}
