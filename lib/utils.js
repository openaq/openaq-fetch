'use strict';

var _ = require('lodash');
var moment = require('moment-timezone');

/**
 * Make sure that the data format is what the platform is expecting.
 */
exports.verifyDataFormat = function (data) {
  // Check that we have a data object with a name and measurements
  if (!data || !data.name || !data.measurements || !data.measurements instanceof Array) {
    return false;
  }

  // Check to make sure name is a string
  if (typeof data.name !== 'string') {
    return false;
  }

  // If we're still here, everything is good
  return true;
};

/**
 * Prune measurements that don't meet our requirements
 */
exports.pruneMeasurements = function (measurements) {
  var validParams = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co', 'bc'];

  return _.filter(measurements, function (m) {
    // Make sure parameter is a string
    if (m.parameter === undefined || typeof m.parameter !== 'string') {
      return false;
    }

    // Make sure parameter is wanted
    if (!_.contains(validParams, m.parameter)) {
      return false;
    }

    // Make sure unit is a string
    if (m.unit === undefined || typeof m.unit !== 'string') {
      return false;
    }

    // Make sure unit matches what we're looking for
    if (m.unit !== 'µg/m³' && m.unit !== 'ppm') {
      return false;
    }

    // Make sure value is a number
    if (m.value === undefined || typeof m.value !== 'number' || isNaN(m.value) === true) {
      return false;
    }

    // Make sure date is present and valid
    if (m.date === undefined || m.date instanceof Object === false) {
      return false;
    }

    if (m.date.utc === undefined || m.date.utc instanceof Date === false ||
        m.date.local === undefined || typeof m.date.local !== 'string') {
      return false;
    }

    // Make sure date is within the last few days to prevent accidents
    var duration = moment.duration(moment().diff(moment(m.date.utc))).asDays();
    if (duration > 3) {
      return false;
    }

    // If we have attribution, make sure it's an object
    if (m.attribution && !m.attribution instanceof Object) {
      return false;
    }

    // If we have coordinates, make sure it's two numbers
    if (m.coordinates) {
      if (m.coordinates.latitude === undefined ||
          m.coordinates.longitude === undefined ||
          typeof m.coordinates.latitude !== 'number' ||
          isNaN(m.coordinates.latitude) ||
          typeof m.coordinates.longitude !== 'number' ||
          isNaN(m.coordinates.longitude)) {
        return false;
      }

      // Make sure coordinates are in bounds
      if (m.coordinates.longitude > 180 || m.coordinates.longitude < -180 ||
          m.coordinates.latitude > 90 || m.coordinates.latitude < -90) {
        return false;
      }
    }

    // Make sure we have a sourceName
    if (m.sourceName === undefined || typeof m.sourceName !== 'string') {
      return true;
    }

    // All that's left is true!
    return true;
  });
};

/**
 * The preferred unit for mass concentration is 'µg/m3', for volumetric
 * concentrations this is 'ppm'.
 * Expects an array of measurements, which is returned with converted units.
 */
exports.convertUnits = function (data) {
  if (!data) {
    return;
  }

  for (var i = 0; i < data.length; i++) {
    var m = data[i];

    switch (m.unit) {
      case 'pphm':
        m.value = m.value / 100;
        m.unit = 'ppm';
        break;
      case 'ppb':
        m.value = m.value / 1000;
        m.unit = 'ppm';
        break;
      case 'ppt':
        m.value = m.value / 1000000;
        m.unit = 'ppm';
        break;
    }
  }
  return data;
};
