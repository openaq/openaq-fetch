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

/**
 * A city name in pinyin romanization or Chinese characters and a station name in chinese characters, get the coordinates of the station
 * To deal with a homonym, Taizhoushi resolves to 泰州 while Taizhou resolves to 台州,
 * even though 台州 and 泰州 have the same pinyin romanization
 * @param {object} city A city name in pinyin romanization or Chinese characters
 * @param {object} station A station name in Chinese characters
 * @return {object} if the location is known, an object with 'latitude' and 'longitude' properties, otherwise undefined
 */
var getCoordinates = function (city, station) {
  switch (city) {
    case 'Hefei':
      city = '合肥';
      break;
    case 'Huaibei':
      city = '淮北';
      break;
    case 'Bozhou':
      city = '亳州';
      break;
    case 'Suzhou':
      city = '宿州';
      break;
    case 'Bengbu':
      city = '蚌埠';
      break;
    case 'Fuyang':
      city = '阜阳';
      break;
    case 'Huainan':
      city = '淮南';
      break;
    case 'Chuzhou':
      city = '滁州';
      break;
    case "Liu'an":
      city = '六安';
      break;
    case "Ma'anshan":
      city = '马鞍山';
      break;
    case 'Wuhu':
      city = '芜湖';
      break;
    case 'Xuancheng':
      city = '宣城';
      break;
    case 'Tongling':
      city = '铜陵';
      break;
    case 'Chizhou':
      city = '池州';
      break;
    case 'Anqing':
      city = '安庆';
      break;
    case 'Huangshan':
      city = '黄山';
      break;
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
  // get the title of first table (which is the table of government/research sources - the second table is private sources)
  // which contains the date-time of the measurement in chinese date time format (year年month月day号 hour时)
  // the regex matches the chinese date time
  let time = $('.hj_inside').find('.data_wrap').first().find('.data_title').text().match(/\d+/g);
  // reassemble into western date time
  time = time[1] + '/' + time[2] + '/' + time[0] + ' ' + time[3] + ':00:00';
  time = getDate(time);

  // get each row in the first table (which is the table of government/research sources - the second table is private sources)
  $('.hj_inside').find('.data_wrap').first().find('.data_mod').find('.data_table').children().each(function (i, elem) {
    let entries = $(elem).children();
    // this regex removes whitespace and endline/return chars
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
          value: parseFloat(values[key]),
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
  return {
    name: 'unused',
    measurements: measurements
  };
};
