/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Thailandian data source.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import {unifyParameters, unifyMeasurementUnits} from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'air4thai';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      console.log(e);
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
const formatData = function (data) {
  // Wrap the JSON.parse() in a try/catch in case it fails
  try {
    data = JSON.parse(data);
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }

  var measurements = [];

  data.stations.forEach(item => {
    const city = String(item.areaEN).split(',');
    const dateMoment = moment.tz(item.AQILast.date + ' ' + item.AQILast.time, 'YYYY-MM-DD HH:mm', 'Asia/Bangkok');
    const base = {
      location: item.nameEN.trim(),
      city: city[city.length - 1].trim(),
      date: {
        utc: dateMoment.toDate(),
        local: dateMoment.format()
      },
      coordinates: {
        latitude: Number(item.lat),
        longitude: Number(item.long)
      },
      attribution: [{name: 'Air4Thai', url: 'http://air4thai.pcd.go.th/webV2/'}]
    };
    Object.keys(item.AQILast).forEach(v => {
      const unaccepted = ['date', 'AQI', 'time'];
      const unit = {
        'PM25': 'µg/m³',
        'PM10': 'µg/m³',
        'O3': 'ppb',
        'CO': 'ppm',
        'NO2': 'ppb',
        'SO2': 'ppb'
      };
      const average = {
        'PM25': 24,
        'PM10': 24,
        'O3': 8,
        'CO': 8,
        'NO2': 1,
        'SO2': 1
      };
      if (!unaccepted.includes(v)) {
        var m = Object.assign({
          unit: unit[v],
          value: Number(item.AQILast[v].value),
          parameter: v,
          averagingPeriod: {unit: 'hours', value: average[v]}
        }, base);
        m = unifyMeasurementUnits(unifyParameters(m));
        if (m.value >= 0) {
          measurements.push(m);
        }
      }
    });
  });

  return {name: 'unused', measurements: measurements};
};
