/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Beijing Kimono data source.
 *
 * @todo This should most likely be moved to a new, consolidated adapter in the future.
 */
'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');
var log = require('../lib/logger');

exports.name = 'beijing';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  var finalURL = source.url + '?apitoken=' + process.env.INDIA_KIMONO_TOKEN;
  request(finalURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      log.error(err || res);
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body);

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
 * @param {object} data Fetched source data
 * @return {object} Parsed and standarized data our system can use
 */
var formatData = function (data) {
  // Wrap the JSON.parse() in a try/catch in case it fails
  try {
    data = JSON.parse(data);
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }

  /**
   * Turns the source value strings into something useable by the system.
   * @param {string} measuredValue Value string from source
   * @return {object} An object containing value and unit for measure value
   */
  var getValue = function (measuredValue) {
    var idx = measuredValue.indexOf('\n');
    var idx2 = measuredValue.indexOf(' ', idx);
    return {
      value: measuredValue.substring(idx + 1, idx2),
      unit: measuredValue.substring(idx2 + 1, measuredValue.length)
    };
  };

  /**
   * Given a date string, convert to system appropriate times.
   * @param {string} dateString Date in string format coming from source data
   * @return {object} An object containing both UTC and local times
   */
  var getDate = function (dateString) {
    var date = moment.tz(dateString, 'MMM DD, YYYY h A', 'Asia/Shanghai');

    return {utc: date.toDate(), local: date.format()};
  };

  // Filter out measurements with no value
  var filtered = _.filter(data.results.collection1, function (m) {
    return getValue(m.measuredValue).value !== '';
  });

  // Build up pretty measurements array
  var measurements = _.map(filtered, function (m) {
    var valueObj = getValue(m.measuredValue);

    // Manually adding offset, find a better way to do this
    var date = getDate(m.date);
    return {
      parameter: 'pm25',
      date: date,
      value: Number(valueObj.value),
      unit: valueObj.unit
    };
  });
  var parsed = {
    'name': data.name,
    'measurements': measurements
  };

  return parsed;
};
