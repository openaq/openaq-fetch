/**
 * This code is responsible for implementing all methods related to
 * fetching and returning data for the Indian data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import log from '../lib/logger';
import { removeUnwantedParameters, convertUnits } from '../lib/utils';

exports.name = 'india';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      log.error(err || res);
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body, source);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      return cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} data Fetched source data
 * @return {object} Parsed and standarized data our system can use
 */
var formatData = function (data, source) {
  var $ = cheerio.load(data);
  var measurementsRaw = $('.ThHead2line')
    .closest('table')
    .find('tr:has(td)')
    .map(function () {
      return {
        parameter: $(this).find('td').first().text(),
        date: $(this).find('td:nth-child(2)').text(),
        time: $(this).find('td:nth-child(3)').text(),
        measuredValue: $(this).find('td:nth-child(4)').text().trim()
      };
    });

  /**
   * Turns the source value strings into something useable by the system.
   * @param {string} measuredValue Value string from source
   * @return {object} An object containing value and unit for measure value
   */
  var getValue = function (measuredValue) {
    return {
      value: _.words(measuredValue, /[^ ]+/g)[0],
      unit: _.words(measuredValue, /[^ ]+/g)[1]
    };
  };

  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var getDate = function (measurement) {
    var dateString = measurement.date + ' ' + measurement.time;
    var m = moment.tz(dateString, 'dddd, MMMM D, YYYY HH:mm:ss', 'Asia/Kolkata');

    return {utc: m.toDate(), local: m.format()};
  };

  // Filter out measurements with no value
  var filtered = _.filter(measurementsRaw, function (m) {
    return _.isFinite(Number(getValue(m.measuredValue).value));
  });

  // Build up pretty measurements array
  var measurements = _.map(filtered, function (m) {
    var valueObj = getValue(m.measuredValue);

    // Parse the date
    var date = getDate(m);

    return {
      parameter: m.parameter.text || m.parameter,
      date: date,
      value: Number(valueObj.value),
      unit: valueObj.unit
    };
  });
  var parsed = {
    'name': source.name,
    'measurements': measurements
  };

  // Make sure the parameters/units names match with what the platform expects.
  parsed.measurements = renameParameters(parsed.measurements);

  // Remove any unwanted parameters
  parsed.measurements = removeUnwantedParameters(parsed.measurements);

  // Convert units to standards
  parsed.measurements = convertUnits(parsed.measurements);

  return parsed;
};

/**
 * Rename parameters to what the system expects
 * @param {array} measurements A list of measurements
 * @return {array} Update measurements array
 */
var renameParameters = function (measurements) {
  return _.map(measurements, function (m) {
    // Parameters
    switch (m.parameter.trim()) {
      case 'Particulate Matter < 2.5 µg':
        m.parameter = 'pm25';
        break;
      case 'Particulate Matter < 10 µg':
        m.parameter = 'pm10';
        break;
      case 'Nitrogen Dioxide':
        m.parameter = 'no2';
        break;
      case 'Ozone':
        m.parameter = 'o3';
        break;
      case 'Carbon Monoxide':
        m.parameter = 'co';
        break;
      case 'Sulphur Dioxide':
        m.parameter = 'so2';
        break;
    }

    // Units
    switch (m.unit) {
      case 'µg/m3':
        m.unit = 'µg/m³';
        break;
    }

    return m;
  });
};
