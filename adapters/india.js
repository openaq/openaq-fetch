'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');

exports.name = 'india';

exports.fetchData = function (source, cb) {
  var finalURL = source.url + '?apitoken=' + process.env.INDIA_KIMONO_TOKEN;
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
      return cb(null, data);
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

  var getValue = function (measuredValue) {
    var idx = measuredValue.indexOf(' ');
    return {
      value: measuredValue.substring(0, idx),
      unit: measuredValue.substring(idx + 1, measuredValue.length)
    };
  };

  var getDate = function (measurement) {
    var dateString = measurement.date + ' ' + measurement.time;
    var m = moment.tz(dateString, 'dddd, MMMM D, YYYY HH:mm:ss', 'Asia/Kolkata');

    return {utc: m.toDate(), local: m.format()};
  };

  // Filter out measurements with no value
  var filtered = _.filter(data.results.collection1, function (m) {
    return getValue(m.measuredValue).value !== '';
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
    'name': data.name,
    'measurements': measurements
  };

  // Make sure the parameters/units names match with what the platform expects.
  renameParameters(parsed.measurements);

  return parsed;
};

var renameParameters = function (measurements) {
  _.map(measurements, function (m) {
    // Parameters
    switch (m.parameter) {
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
