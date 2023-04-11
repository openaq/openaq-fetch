'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import cloneDeep from 'lodash/cloneDeep.js';
import flatten from 'lodash/flatten.js';
import { DateTime } from 'luxon'

import got from 'got';

export const name = 'au_act';

export function fetchData (source, cb) {
  const timeAgo = DateTime.now().setZone('Australia/Sydney').minus({ days: 1 }).toFormat('yyyy-LL-dd\'T\'HH:mm:ss');

  got(source.url, {
    searchParams: {
      '$query': `select *, :id where (\`datetime\` > '${timeAgo}') order by \`datetime\` desc limit 1000`
    },
    timeout: {
      request: REQUEST_TIMEOUT
    }
  }).then(res => {
    const body = res.body;
    
    try {
      let data = formatData(JSON.parse(body), source);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  }).catch(err => {
    console.error('Error:', err.message, err.response && err.response.body);
    return cb({message: 'Failure to load data url.'});
  });
  
}


let formatData = function (data, source) {
  let parseDate = function (string) {
    const date = DateTime.fromISO(string, { zone: 'Australia/Sydney' });
    return {
      utc: date.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
      local: date.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ")
    };
  };

  // mapping of types from source data into OpenAQ format
  let types = {
    'no2': 'no2',
    'o3_1hr': 'o3',
    'co': 'co',
    'pm10': 'pm10',
    'pm2_5': 'pm25'
  };

  let units = {
    'no2': 'ppm',
    'o3': 'ppm',
    'co': 'ppm',
    'pm10': 'µg/m³',
    'pm25': 'µg/m³'
  };

  let measurements = [];

  data.forEach(function (row) {
    // base measurement properties
    const baseMeasurement = {
      location: row.name,
      city: 'Canberra',
      country: 'AU',
      date: parseDate(row.datetime),
      sourceName: source.name,
      sourceType: 'government',
      mobile: false,
      coordinates: {
        latitude: parseFloat(row.gps.latitude),
        longitude: parseFloat(row.gps.longitude)
      },
      attribution: [{
        name: 'Health Protection Service, ACT Government',
        url: 'https://www.data.act.gov.au/Environment/Air-Quality-Monitoring-Data/94a5-zqnn'
      }],
      averagingPeriod: {'value': 1, 'unit': 'hours'}
    };

    Object.keys(types).forEach(function (type) {
      if (type in row) {
        let measurement = cloneDeep(baseMeasurement);

        measurement.parameter = types[type];
        measurement.value = parseFloat(row[type]);
        measurement.unit = units[types[type]];

        measurements.push(measurement);
      }
    });
  });

  return {
    name: 'unused',
    measurements: flatten(measurements)
  };
};
