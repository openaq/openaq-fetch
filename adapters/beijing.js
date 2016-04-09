/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data from StateAir.net data source.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import log from '../lib/logger';

exports.name = 'beijing';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      log.error(err || res.statusCode);
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
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} data Fetched source data
 * @param {object} source A valid source object
 * @return {object} Parsed and standardized data our system can use
 */
var formatData = function (data, source) {
  /**
   * Given a date string, convert to system appropriate times.
   * @param {string} dateString Date in string format coming from source data
   * @return {object} An object containing both UTC and local times
   */
  var getDate = function (dateString) {
    var date = moment.tz(dateString, 'MM/DD/YYYY HH:mm:ss A', 'Asia/Shanghai');
    return {utc: date.toDate(), local: date.format()};
  };

  // Load all the XML
  var $ = cheerio.load(data, {xmlMode: true});

  // Create measurements array
  var measurements = [];

  // Build up the base object
  var baseObj = {
    location: source.name,
    parameter: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: {'value': 1, 'unit': 'hours'},
    attribution: [{
      name: 'StateAir.net',
      url: source.sourceURL
    }]
  };

  // Loop over each item and save the object
  $('item').each(function (i, elem) {
    // Clone base object
    var obj = _.cloneDeep(baseObj);

    obj.value = Number($(elem).children('Conc').text());
    obj.date = getDate($(elem).children('ReadingDateTime').text());

    measurements.push(obj);
  });

  return {
    name: 'unused',
    measurements: measurements
  };
};
