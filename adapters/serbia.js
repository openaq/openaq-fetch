/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Serbian data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { unifyMeasurementUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'serbia';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body);

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

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
const formatData = function (data) {
  // Wrap the JSON.parse() in a try/catch in case it fails
  try {
    data = JSON.parse(data);
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }
  /**
   * A method that takes input of a location and returns which city it is from
   * @param {String} name of location
   * @returns {String} city of the location
   */
  const getCity = function (name) {
    switch (name) {
      case 'Kikinda Centar':
        return 'Kikinda';
      case 'Novi Sad Rumenačka':
      case 'Novi Sad Liman':
      case 'Novi Sad Šangaj ':
        return 'Novi Sad';
      case 'Beočin Centar':
        return 'Beočin';
      case 'Sremska Mitrovica':
        return 'Sremska Mitrovica';
      case 'Pančevo Sodara':
        return 'Pančevo';
      case 'Beograd Stari grad':
      case 'Beograd Novi Beograd':
      case 'Beograd Mostar':
      case 'Beograd Vračar':
      case 'Beograd Zeleno brdo':
      case 'Obedska bara ':
        return 'Beograd';
      case 'Smederevo Centar':
        return 'Smederevo';
      case 'Obrenovac Centar':
        return 'Obrenovac'
      case 'Smederevo Carina':
        return 'Smederevo';
      case 'Bor Krivelj-ZIJIN':
      case 'Bor Brezonik':
      case 'Bor Gradski park':
      case 'Bor Institut RIM':
      case 'Bor Slatina-ZIJIN':
        return 'Bor';
      case 'Kamenički Vis EMEP':
        return 'Kamenica';
      case 'Niš O.š. Sveti Sava':
        return 'Niš';
      case 'Deliblatska peščara':
        return 'Banat';
      case 'Pančevo Cara Dušana':
      case 'Pančevo Vatrogasni dom':
      case 'Pančevo Vojlovica':
      case 'Pančevo Starčevo':
        return 'Pančevo';
      case 'Novi Pazar':
        return 'Novi Pazar';
    }
  }
  // the parameters here are given numbers instead of measurement name, there a convertion is needed
  const paramMap = {
    '1': 'so2',
    '8': 'no2',
    '10': 'co',
    '7': 'o3',
    '5': 'pm10',
    '6001': 'pm25'
  }
  var measurements = [];
  Object.keys(data).forEach(key => {
    // The data itself has no timestamp, but according to http://www.amskv.sepa.gov.rs/index.php, the data is from the last hour
    const dateMoment = moment.tz(moment().startOf('hour'), 'YYYY-MM-DD HH:mm', 'Europe/Belgrade');
    var baseObject = {
      location: data[key].k_name,
      city: (String(data[key].k_name).split(' ').length === 1) ? data[key].k_name : getCity(data[key].k_name),
      coordinates: {
        latitude: Number(data[key].k_latitude_d),
        longitude: Number(data[key].k_longitude_d)
      },
      date: {
        utc: dateMoment.toDate(),
        local: dateMoment.format()
      },
      attribution: [{name: 'SEPA', url: 'http://www.amskv.sepa.gov.rs/index.php'}],
      averagingPeriod: {unit: 'hours', value: 1}
    };
    if (typeof data[key].components !== 'undefined') {
      Object.keys(data[key].components).forEach(p => {
        const param = paramMap[p];
        if (typeof param !== 'undefined') {
          if (typeof data[key].components[p]['1h'] !== 'undefined') {
            var m = Object.assign({
              value : Number(data[key].components[p]['1h'].raw_value),
              unit : (param !== 'co') ? 'µg/m³' : 'mg/m³',
              parameter : param},
              baseObject);
            m = unifyMeasurementUnits(m);
            measurements.push(m);
          }
        }
      });
    }
  });
  return {name: 'unused', measurements: measurements};
};
