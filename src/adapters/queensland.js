'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { removeUnwantedParameters } from '../lib/utils.js';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'queensland';

export function fetchData (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb(err || res);
    }

    try {
      var data = formatData(body, source);
      var result = {
        name: 'unused',
        measurements: _.flatten(data)
      };

      result.measurements = removeUnwantedParameters(result.measurements);
      return cb(null, result);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

const renameParameter = function (parameter) {
  switch (parameter) {
    case 'Nitrogen Dioxide':
      return 'no2';
    case 'Sulfur Dioxide':
      return 'so2';
    case 'Carbon Monoxide':
      return 'co';
    case 'Particle PM2.5':
      return 'pm25';
    case 'Ozone':
      return 'o3';
    case 'Particle PM10':
      return 'pm10';
    default:
      return parameter;
  }
};

const getParameterUnit = function (parameter) {
  switch (parameter) {
    case 'pm25':
    case 'pm10':
    case 'bc':
      return 'µg/m³';
    case 'no2':
    case 'so2':
    case 'o3':
    case 'co':
      return 'ppm';
    default:
      return '?';
  }
};

// hardcoded coordinates for locations with no coordinates from source
var locationCoordinates = {
  'Miles Airport': { latitude: -26.8088, longitude: 150.1799 },
  'Hopeland': { latitude: -26.8637, longitude: 150.5028 }
};

var formatData = function (data, source) {
  var $ = cheerio.load(data, {xmlMode: true});

  var dateStr = $('category').attr('measurementdate') + $('category').attr('measurementhour');
  var date = moment.tz(dateStr, 'YYYY-MM-DDHH', 'Australia/Queensland');
  var dates = {utc: date.toDate(), local: date.format()};

  var measurements = [];

  $('measurement').each(function (i, elem) {
    var location = $(this).parent().attr('name');
    var param = renameParameter($(this).attr('name'));

    var m = {
      date: dates,
      parameter: param,
      location: location,
      value: Number($(this).text()),
      unit: getParameterUnit(param),
      city: $(this).parent().parent().attr('name'),
      attribution: [{
        name: 'The State of Queensland (Department of Environment and Science)',
        url: source.sourceURL
      }, {
        name: 'The State of Queensland (Department of Environment and Science)',
        url: $(this).parent().attr('information')
      }],
      averagingPeriod: {'value': 1, 'unit': 'hours'}
    };

    // Add coordinates if they're available
    if ($(this).parent().attr('latitude') && $(this).parent().attr('longitude') && Number($(this).parent().attr('latitude')) !== 0 && Number($(this).parent().attr('longitude')) !== 0) {
      m.coordinates = {
        latitude: Number($(this).parent().attr('latitude')),
        longitude: Number($(this).parent().attr('longitude'))
      };
    }

    if (!m.coordinates && locationCoordinates[m.location]) {
      m.coordinates = locationCoordinates[m.location];
    }

    measurements.push(m);
  });

  return measurements;
};
