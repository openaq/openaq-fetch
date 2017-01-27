'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { removeUnwantedParameters } from '../lib/utils';

exports.name = 'queensland';

exports.fetchData = function (source, cb) {
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
      cb(null, result);
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

var formatData = function (data, source) {
  var $ = cheerio.load(data, {xmlMode: true});

  var date = moment.tz($('category').attr('measurementdate') + $('category').attr('measurementhour'), 'YYYY-MM-DDHH', 'Australia/Brisbane');
  var dates = {utc: date.toDate(), local: date.format()};

  var measurements = [];

  // todo:
  // set relative units
  // get coordinates
  // pinpoint cities from coordinates

  $('measurement').each(function (i, elem) {
    var m = {
      date: dates,
      parameter: renameParameter($(this).attr('name')),
      location: $(this).parent().attr('name'),
      value: Number($(this).text()),
      unit: 'µg/m³',
      city: 'Unknown',
      region: $(this).parent().parent().attr('name'),
      attribution: [{
        name: source.name,
        url: source.sourceURL
      }],
      averagingPeriod: {'value': 1, 'unit': 'hours'},
      coordinates: {
        latitude: 0,
        longitude: 0
      }
    };
    measurements.push(m);
  });

  return measurements;
};
