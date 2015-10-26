'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');

exports.name = 'agaar_mn';

exports.fetchData = function (source, cb) {
  var finalURL = source.url;
  request(finalURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      console.error(err || res);
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

var formatData = function (data) {
  // Wrap the JSON.parse() in a try/catch in case it fails
  try {
    data = JSON.parse(data);
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }

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
        coordinates: m.coordinates
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
