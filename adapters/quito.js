'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';

exports.name = 'quito';

const locations = [
  'CML',
  'COT',
  'GUA',
  'TUM',
  'CH',
  'P',
  'ITC',
  'CAR',
  'JIP',
  'BEL',
  'CEN'
];
const measurementTypes = ['PM 2.5', 'PM 10', 'CO', 'NO2', 'SO2', 'O3'];

const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });

const renameParameter = function (parameter) {
  switch (parameter) {
    case 'NO2':
      return 'no2';
    case 'SO2':
    case 'Sulfur Dioxide':
      return 'so2';
    case 'CO':
      return 'co';
    case 'PM2.5':
    case 'PM 2.5':
      return 'pm25';
    case 'O3':
      return 'o3';
    case 'PM10':
    case 'PM 10':
      return 'pm10';
    default:
      return parameter;
  }
};

const getNowDateFields = function () {
  let dateObj = new Date();
  let output = {};
  output['month'] = dateObj.getUTCMonth() + 1;
  output['day'] = dateObj.getUTCDate();
  output['year'] = dateObj.getUTCFullYear();
  return output;
};
const nowDateObject = getNowDateFields();

var allMeasurements = [];

exports.fetchData = function (source, cb) {
  function sanitizeDate (date) {
    try {
      var utc = moment.tz(date['utc'], 'America/Guayaquil');
      var local = moment.tz(date['local'], 'America/Guayaquil');
      return {
        utc: utc.toDate(),
        local: local.format()
      };
    } catch (error) {
      return cb({ message: 'Failed to parse date.' });
    }
  }

  function formatData (_, data) {
    let dataObject = JSON.parse(data);
    dataObject.forEach((element) => {
      let m = {
        location: element['location'],
        value: element['value'],
        unit: element['unit'],
        parameter: renameParameter(element['parameter']),
        averagingPeriod: element['averagingPeriod'],
        date: sanitizeDate(element['date']),
        coordinates: element['coordinates'],
        attribution: element['attribution'],
        city: element['city'],
        country: element['country'],
        sourceType: element['sourceType'],
        sourceName: element['sourceName'],
        mobile: element['mobile'] === 'true'
      };
      allMeasurements.push(m);
    });
    return allMeasurements;
  }

  locations.forEach((station) => {
    measurementTypes.forEach((measurement) => {
      var propertiesObject = {
        itvl: '1 hour',
        year: nowDateObject['year'],
        dom: nowDateObject['day'],
        month: nowDateObject['month'],
        magnitude: measurement,
        location: station
      };
      request(
        {
          url: source.url,
          headers: {
            'User-Agent': 'OpenAQ',
            Accept: '*/*',
            Connection: 'keep-alive'
          },
          qs: propertiesObject
        },
        function (err, res, body) {
          if (err || res.statusCode !== 200) {
            return cb({ message: 'Failure to load data url.' });
          }

          try {
            var data = formatData(source, body);

            if (data === undefined) {
              return cb({ message: 'Failure to parse data.' });
            }
          } catch (e) {
            return cb({ message: 'Unknown adapter error.' });
          }
          return cb(null, {
            name: 'unused',
            measurements: allMeasurements
          });
        }
      );
    });
  });
};
