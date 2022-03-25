/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Chilean data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import async from 'async';
import { join } from 'path';
import cheerio from 'cheerio';

// Adding in certs to get around unverified connection issue
require('ssl-root-cas')
  .inject()
  .addFile(join(__dirname, '..', '/certs/OrganizationSSL.crt.txt'));
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'chile';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  // Fetch both the measurements and meta-data about the locations
  var sources = [source.url, 'http://sinca.mma.gob.cl/index.php/json/listado'];
  var tasks = [];

  _.forEach(sources, function (e) {
    var task = function (cb) {
      request(e, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        cb(null, body);
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
var formatData = function (results) {
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

  var paramMap = {
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
  var getComuna = function (id) {
    var s = _.get(_.find(meta, _.matchesProperty('key', id)), 'comuna');
    return s;
  };

  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var parseDate = function (m) {
    var date = moment.tz(m, 'YYYY-MM-DD HH:mm', 'America/Santiago');
    return {utc: date.toDate(), local: date.format()};
  };

  /**
   * Make 'µg/m³' pretty
   * @param {string} u The measurement unit
   * @return {string} It's pretty!
   */
  var parseUnit = function (u) {
    var $ = cheerio.load(u, { decodeEntities: false });
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
        m.value = Number(value.c[1].v);
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
