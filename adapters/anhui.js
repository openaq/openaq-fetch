/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data from Anhui's Enviormental Protection Ministry data source.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import {transliterate as tr} from 'transliteration';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'anhui';
/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
export const fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
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
      return cb({message: 'Unknown adapter error'});
    }
  });
};

var getCoordinates = function (city, station) {
  if (city === 'Hefei') {
    city = '合肥';
  }
  let cords = require('../data_scripts/china-locations.json')[city + station];
  if (cords) {
    var lon = cords[0];
    var lat = cords[1];
    return {latitude: lat, longitude: lon};
  } else {
    return undefined;
  }
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
    var date = moment.tz(dateString, 'MM/DD/YYYY HH:mm:ss', 'Asia/Shanghai');
    return {utc: date.toDate(), local: date.format()};
  };

  // Create measurements array
  var measurements = [];

  // load data
  var $ = cheerio.load(data);

  // parse date-time
  let time = $('.hj_inside').find('.data_wrap').first().find('.data_title').text().match(/\d+/g);
  time = time[1] + '/' + time[2] + '/' + time[0] + ' ' + time[3] + ':00:00';
  time = getDate(time);

  $('.hj_inside').find('.data_wrap').first().find('.data_mod').find('.data_table').children().each(function (i, elem) {
    let entries = $(elem).children();
    let stationName = entries[0].children[0].data.replace(/\s+\s|\\r|\\n/g, '');
    let values = {};
    values.no2 = entries[1];
    values.so2 = entries[2];
    values.co = entries[3];
    values.o3 = entries[4];
    values.pm10 = entries[5];
    values.pm25 = entries[6];
    for (var key in values) {
      values[key] = values[key].children[0].data.replace(/\s+\s|\\r|\\n/g, '');
      if (key === 'co') {
        values[key] = values[key] * 1000;
      }
      if (!isNaN(values[key])) {
        let obj = {
          location: source.name + ' ' + tr(stationName),
          parameter: key,
          unit: 'µg/m³',
          averagingPeriod: {'value': 1, 'unit': 'hours'},
          date: time,
          value: values[key],
          attribution: [{
            name: 'Envoirnmental Protection Department of Anhui Province',
            url: source.sourceURL
          }]
        };
        let cords = getCoordinates(source.city, stationName);
        if (cords) {
          obj.coordinates = cords;
        }
        measurements.push(obj);
      }
    }
  });
  return measurements;
};
