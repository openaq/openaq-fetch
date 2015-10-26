'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');

exports.name = 'beijing';

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

  var getValue = function (measuredValue) {
    var idx = measuredValue.indexOf('\n');
    var idx2 = measuredValue.indexOf(' ', idx);
    return {
      value: measuredValue.substring(idx + 1, idx2),
      unit: measuredValue.substring(idx2 + 1, measuredValue.length)
    };
  };

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
