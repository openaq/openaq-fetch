'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { flatten, cloneDeep } from 'lodash';
import { default as moment } from 'moment-timezone';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'act';

exports.fetchData = function (source, cb) {
  // Fetch the data
  // FIXME ensure this timeAgo is in Australia/Canberra local time
  var timeAgo = moment().subtract(2, 'days').format('YYYY-MM-DDTHH:mm:ss');
  request({
    uri: source.url,
    qs: {
      '$query': `select *, :id where ('datetime' > '${timeAgo}') order by \`datetime\` desc limit 100`
    }
  }, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(JSON.parse(body), source);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

var formatData = function (data, source) {
  var parseDate = function (string) {
    var date = moment.tz(string, 'Australia/Sydney');
    return {utc: date.toDate(), local: date.format()};
  };

  var types = {
    'no2': 'no2',
    'o3_1hr': 'o3',
    'co': 'co',
    'pm10': 'pm10',
    'pm2.5': 'pm25'
  };

  var units = {
    'no2': 'ppm',
    'o3': 'ppm',
    'co': 'ppm',
    'pm10': 'µg/m³',
    'pm25': 'µg/m³'
  };

  var measurements = [];

  data.forEach(function (row) {
    // base measurement properties
    const baseMeasurement = {
      location: row.name,
      city: 'Canberra',
      country: 'AU',
      date: parseDate(row.datetime),
      sourceName: 'AU_ACT',
      sourceType: 'government',
      mobile: false,
      coordinates: {
        latitude: Number(row.gps.latitude),
        longitude: Number(row.gps.longitude)
      },
      attribution: [{
        name: 'Health Protection Service, ACT Government',
        url: 'https://www.data.act.gov.au/Environment/Air-Quality-Monitoring-Data/94a5-zqnn'
      }],
      averagingPeriod: {'value': 1, 'unit': 'hours'}
    };

    Object.keys(types).forEach(function (type) {
      if (type in row) {
        var measurement = cloneDeep(baseMeasurement);

        measurement.parameter = types[type];
        measurement.value = Number(row[type]);
        measurement.unit = units[types[type]];

        measurements.push(measurement);
      }
    });
  });

  return {
    name: 'unused',
    measurements: flatten(measurements)
  };
};
