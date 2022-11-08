/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for Lombardy in Italy.
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

// Adding in certs to get around unverified connection issue
require('ssl-root-cas/latest')
  .inject()
  .addFile(join(__dirname, '..', '/certs/OrganizationSSL.crt.txt'));
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'arpaeL';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  // Fetch both the measurements and meta-data about the locations
  var sources = [source.url + 'nicp-bhqi.json', source.url + 'ib47-atvt.json'];
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
  /* source has a lot of extra polutants
    'Cadmio':'cd',
    'Piombo':'pb',
    'Benzo(a)pirene':
    'Benzene':'c6h6',
    'Ammoniaca': 'nh3',
    'Arsenico': 'as',
    'Monossido di Azoto':'no',
    'Ossidi di Azoto':'nox',
        'Particolato Totale Sospeso': 'pm10', //not sure what type of value this is pm10 or pm25, seem to be all kinds of pms
  */
  var paramMap = {
    'Biossido di Azoto': 'no2',
    'PM10 (SM2005)': 'pm10',
    'Ozono': 'o3',
    'Monossido di Carbonio': 'co',
    'Biossido di Zolfo': 'so2',
    'Particelle sospese PM2.5': 'pm25',
    'BlackCarbon': 'bc',
    'PM10': 'pm10'
  };
  // filters out data that is invalid
  data = data.filter(function (el) { return (String(el.stato).localeCompare('VA') === 0); });
  /**
   * Passing through id from data and getting the sensor it is associated with
   * @param {string} id sensorid from data, to compare with the sensors
   * @return {object} object of the sensor with matching id
   */
  var getSensor = function (id) {
    return _.find(meta, function (s) { return (String(s.idsensore).localeCompare(String(id)) === 0); });
  };
  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} da A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var parseDate = function (date) {
    date = moment.tz(date, 'YYYY-MM-DDHH:mm', 'Europe/Vaduz');
    return {utc: date.toDate(), local: date.format()};
  };
  /**
   * Make 'µg/m³' pretty
   * @param {string} u The measurement unit
   * @return {string} It's pretty!
   */
  var parseUnit = function (u) {
    return (u === '&micro;g/m<sup>3</sup>' || u === '&micro;g/Nm<sup>3</sup>' || u === '&micro;g/m<sup>3</sup>N') ? 'µg/m³' : u;
  };
  var measurements = [];
  _.forEach(data, function (s) {
    var sensor = getSensor(s.idsensore);
    if (typeof paramMap[sensor.nometiposensore] !== 'undefined') {
      var m = {
        date: parseDate(s.data),
        value: Number(s.valore),
        unit: parseUnit(sensor.unitamisura),
        parameter: paramMap[sensor.nometiposensore],
        city: sensor.comune,
        location: sensor.nomestazione,
        coordinates: {
          latitude: Number(sensor.location.latitude),
          longitude: Number(sensor.location.longitude)
        },
        attribution: [
          {name: 'Arpae Lombardia', url: 'https://www.arpalombardia.it/Pages/ARPA_Home_Page.aspx'}
        ]
      };
      measurements.push(m);
    }
  });
  return {
    name: 'unused',
    measurements: measurements
  };
};
