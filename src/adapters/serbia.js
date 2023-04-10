/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Serbian data sources.
 * adapted from openaq-fetch PR #741 credit to @magsyg
 */

'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as baseRequest } from 'request';
import { DateTime } from 'luxon';
import { unifyMeasurementUnits } from '../lib/utils.js';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'serbia';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export function fetchData (source, cb) {
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

  // the parameters here are given numbers instead of measurement name, there a convertion is needed
  const paramMap = {
    '1': 'so2',
    '8': 'no2',
    '10': 'co',
    '7': 'o3',
    '5': 'pm10',
    '6001': 'pm25'
  };

  let measurements = [];
  Object.keys(data).forEach(key => {
    // The data itself has no timestamp, but according to http://www.amskv.sepa.gov.rs/index.php, the data is from the last hour
    const dateMoment = DateTime.local().startOf('hour').setZone('Europe/Belgrade');
    let baseObject = {
      location: data[key].k_name,
      city: data[key].k_city ? data[key].k_city : data[key].k_name,
      coordinates: {
        latitude: parseFloat(data[key].k_latitude_d),
        longitude: parseFloat(data[key].k_longitude_d)
      },
      date: {
        utc: dateMoment.toUTC().toISO({suppressMilliseconds: true}),
        local: dateMoment.toISO({suppressMilliseconds: true}) 
      },
      attribution: [{name: 'SEPA', url: 'http://www.amskv.sepa.gov.rs/index.php'}],
      averagingPeriod: {unit: 'hours', value: 1}
    };
    if (typeof data[key].components !== 'undefined') {
      Object.keys(data[key].components).forEach(p => {
        const param = paramMap[p];
        if (typeof param !== 'undefined') {
          if (typeof data[key].components[p]['1h'] !== 'undefined') {
            let m = Object.assign({
              value: parseFloat(data[key].components[p]['1h'].raw_value),
              unit: (param !== 'co') ? 'µg/m³' : 'mg/m³',
              parameter: param},
            baseObject);
            m = unifyMeasurementUnits(m);
            measurements.push(m);
          }
        }
      });
    }
  });
  measurements = measurements.filter(m => !isNaN(m.coordinates.latitude) || !isNaN(m.coordinates.longitude));
  return {name: 'unused', measurements: measurements};
};
