/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the South African data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import _ from 'lodash';
import { unifyMeasurementUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'southafrica';

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
  /**
   * Convertor for pollutant, to make it look like the standard for the program, returns null if it is not an acceptable pollutant
   * @param {String} pollutant that is going to be converted to the right format
   * @returns {String} if pollutant is acceptable, null if not
   */
  var getPollutant = function (pollutant) {
    switch (pollutant) {
      case 'O3':
        return 'o3';
      case 'NO2':
        return 'no2';
      case 'PM2_5':
        return 'pm25';
      case 'PM10':
        return 'pm10';
      case 'CO':
        return 'co';
      case 'SO2':
        return 'so2';
      default:
        return null;
    }
  };
  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var parseDate = function (m) {
    var date = moment.tz(m, 'YYYY-MM-DDHH:mm', 'Africa/Johannesburg');
    return {utc: date.toDate(), local: date.format()};
  };
  const measurements = [];
  _.forEach(data, function (s) {
    const base = {
      location: s.location,
      city: s.city,
      coordinates: {
        latitude: Number(s.latitude),
        longitude: Number(s.longitude)
      },
      attribution: [{name: 'South African Air Quality Information System', url: 'http://saaqis.environment.gov.za'}],
      averagingPeriod: {unit: 'hours', value: 1}
    };
    _.forOwn(s.monitors, function (v, key) {
      const pollutant = getPollutant(v.Pollutantname);
      if (v.value > 0 && v.value !== null && pollutant !== null) {
        var m = _.clone(base);
        m.parameter = pollutant;
        m.value = Number(v.value);
        m.unit = v.unit;
        m.date = parseDate(v.DateVal);
        m = unifyMeasurementUnits(m);
        measurements.push(m);
      }
    });
  });
  return {name: 'unused', measurements: measurements};
};
