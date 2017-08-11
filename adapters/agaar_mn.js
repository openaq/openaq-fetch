/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Agaar.mn data sources.
 *
 * This is a fairly clean adapter since we're able to call a data API and not
 * scrape the source.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'agaar_mn';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  var finalURL = source.url;
  request(finalURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
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
   * Given a date string, convert to system appropriate times.
   * @param {string} dateString Date in string format coming from source data
   * @return {object} An object containing both UTC and local times
   */
  var getDate = function (dateString) {
    var m = moment.tz(dateString, 'YYYY-MM-DD HH:mm', 'Asia/Ulaanbaatar');

    return {utc: m.toDate(), local: m.format()};
  };

  // Handle the fact that there are several locations in one response
  var locations = [];
  _.forEach(data, function (location) {
    var l = {
      name: location.name,
      measurements: []
    };
    var base = {
      name: location.name,
      date: location.lastUpdated,
      coordinates: {
        latitude: location.lat,
        longitude: location.lon
      }
    };

    // Loop over each measurement and add it
    _.forEach(location.elementList, function (m) {
      var obj = _.clone(base);
      obj.parameter = m.id;
      obj.value = m.current;
      obj.unit = m.unit;
      l.measurements.push(obj);
    });

    // Filter out measurements with no value
    var filtered = _.filter(l.measurements, function (m) {
      return isNaN(m.value) === false && m.value !== '' && m.value !== null;
    });

    // Build up pretty measurements array
    var measurements = _.map(filtered, function (m) {
      var date = getDate(m.date);
      return {
        location: m.name,
        parameter: m.parameter,
        date: date,
        value: Number(m.value),
        unit: 'µg/m³',
        coordinates: m.coordinates,
        attribution: [
          {name: 'Agaar.mn', url: 'http://agaar.mn/'},
          {name: 'National Agency of Meteorology and Environmental Monitoring', url: 'http://namem.gov.mn'}
        ]
      };
    });
    l.measurements = measurements;

    // Add to locations
    locations.push(l);
  });

  // Remove any locations without a measurement
  locations = _.filter(locations, function (l) {
    return l.measurements.length > 0;
  });

  // Flatten to one locations array
  var measurements = [];
  _.forEach(locations, function (l) {
    measurements.push(l.measurements);
  });
  measurements = _.flatten(measurements);

  return {
    name: 'unused',
    measurements: measurements
  };
};
