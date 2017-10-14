'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { acceptableParameters, convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'arpae';

const ckanResourceID = 'a1c46cfe-46e5-44b4-9231-7d9260a38e68';
// fixme: date range in sql
const sql = `SELECT * from "${ckanResourceID}" WHERE reftime >= '2017-09-28T23:59:00' AND reftime <= '2017-09-29T00:00:00' ORDER BY reftime DESC`;
const sqlUrl = `https://dati.arpae.it/api/action/datastore_search_sql?sql=${sql}`;

exports.fetchData = function (source, cb) {
  request(sqlUrl, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb(err || res);
    }
    const data = JSON.parse(body);
    const records = data['result']['records'];
    let measurements = [];
    records.forEach((record) => {
      const parameter = parameters[record.variable_id].parameter;
      if (acceptableParameters.indexOf(parameter) === -1) {
        return;
      }
      const unit = parameters[record.variable_id].unit;

      const mDate = moment.tz(record.reftime, source.timezone);
      measurements.push({
        value: Number(record.value),
        unit: unit,
        parameter: parameter,
        date: {
          utc: mDate.toDate(),
          local: mDate.format()
        },
        country: source.country,
        city: 'city', // fixme
        name: `Arpae-${record.station_id}`,
        coordinates: {
          latitude: 0,
          longitude: 0 // fixme
        },
        attribution: [
          {
            name: source.name,
            url: source.sourceURL
          }
        ]
      });
    });

    measurements = convertUnits(measurements);
    console.log(measurements);

    return cb(null, {
      name: 'unused',
      measurements: measurements
    });
  });
};

// parameter ID mapping
// generated with ../data_scripts/arpae-parameters.js
const parameters = {
  '1': { parameter: 'so2', unit: 'ug/m3' },
  '5': { parameter: 'pm10', unit: 'ug/m3' },
  '7': { parameter: 'o3', unit: 'ug/m3' },
  '8': { parameter: 'no2', unit: 'ug/m3' },
  '9': { parameter: 'nox', unit: 'ug/m3' },
  '10': { parameter: 'co', unit: 'mg/m3' },
  '20': { parameter: 'c6h6', unit: 'ug/m3' },
  '21': { parameter: 'c6h5-ch3', unit: 'ug/m3' },
  '38': { parameter: 'no', unit: 'ug/m3' },
  '82': { parameter: 'o-xylene', unit: 'ug/m3' },
  '111': { parameter: 'pm2.5', unit: 'ug/m3' }
};
