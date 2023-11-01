/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Chilean data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import _ from 'lodash';
import async from 'async';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import client from '../lib/requests.js';
import log from '../lib/logger.js';

// Adding in certs to get around unverified connection issue
// 2022-04-29 - this should no longer be needed
//require('ssl-root-cas')
//  .inject()
//  .addFile(join(__dirname, '..', '/certs/OrganizationSSL.crt.txt'));

export const name = 'chile';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
export function fetchData (source, cb) {
  // Fetch both the measurements and meta-data about the locations
  var sources = [source.url, 'http://sinca.mma.gob.cl/index.php/json/listado'];
  var tasks = [];

  _.forEach(sources, function (e) {
    var task = function (cb) {
      client(e)
        .then((response) => {
          if (response.statusCode !== 200) {
            return cb(response);
          }
          cb(null, response.body);
        })
        .catch((error) => {
          cb(error);
        });
    };
  
    tasks.push(task);
  });

  async.parallel(tasks, function (err, results) {
    if (err) {
      return cb({message: 'Failure to load data urls.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(results);
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
const formatData = function (results) {
  try {
    var data = JSON.parse(results[0]);
    var meta = JSON.parse(results[1]);
  } catch (e) {
    return undefined;
  }

  // Measurements are stored in a 'status' object. If there are no measurements
  // 'status' will be an empty array.
  var reportingStations = _.filter(data, function (s) {
    return s.realtime.length > 0;
  });

  const paramMap = {
    'PM25': 'pm25',
    'PM10': 'pm10',
    '0001': 'so2', // Dióxido de azufre
    '0003': 'no2', // Dióxido de nitrógeno
    '0004': 'co', // Monóxido de carbono
    '0008': 'o3' // Ozono
  };

  /**
   * Fetch the city (comuna) from the metadata endpoint
   * @param {string} id The communa id
   * @return {string} The communa name
   */
  const getComuna = function (id) {
    var s = _.get(_.find(meta, _.matchesProperty('key', id)), 'comuna');
    return s;
  };

  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */

  const parseDate = function (dateString) {
    // Validate input
    if (typeof dateString !== 'string' || dateString.trim() === '') {
      throw new Error('Invalid date string');
    }

    try {
      // Create DateTime object with timezone using the fromFormat() method
      const date = DateTime.fromFormat(
        dateString,
        'yyyy-MM-dd HH:mm',
        {
          zone: 'America/Santiago',
        }
      );

      // Return UTC and local ISO strings
      return {
        utc: date.toUTC().toISO({
          suppressMilliseconds: true,
        }),
        local: date.toISO({ suppressMilliseconds: true }),
      };
    } catch (error) {
      log.error('Error parsing date:', error);
      throw new Error('Error parsing date');
    }
  };
  /**
   * Make 'µg/m³' pretty
   * @param {string} u The measurement unit
   * @return {string} It's pretty!
   */
  const parseUnit = function (u) {
    var $ = load(u, { decodeEntities: false });
    var str = $.text();
    return str.indexOf('µg⁄m3') > -1 ? 'µg/m³' : null;
  };

  var measurements = [];

  _.forEach(reportingStations, function (s) {
    // Store the main properties for this measuring station
    // Sometimes the listado object doesn't exist, in that case, defaulting to nombre
    var base = {
      city: getComuna(s.key) || s.nombre,
      location: s.nombre,
      coordinates: {
        latitude: s.latitud,
        longitude: s.longitud
      },
      attribution: [
        {name: 'SINCA', url: 'http://sinca.mma.gob.cl/'},
        {name: s.empresa}
      ]
    };
    _.filter(s.realtime, function (valueMeasurment) {
      _.filter(valueMeasurment.info.rows, function (value) {
        var m = _.clone(base);
        m.parameter = paramMap[valueMeasurment.code];
        m.date = parseDate(value.c[0].v);
        m.value = parseFloat(value.c[1].v);
        var unit = parseUnit(value.c[3].v);
        if (unit) {
          m.unit = unit;
          measurements.push(m);
        }
      });
    });
  });
  return {
    name: 'unused',
    measurements: measurements
  };
};
