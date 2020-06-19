/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Irish data sources.
 *
 * This is a three-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import {unifyParameters, unifyMeasurementUnits} from '../lib/utils';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import async from 'async';
import cheerio from 'cheerio';

// Adding in certs to get around unverified connection issue
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'ireland';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = async function (source, cb) {
  // First fetches the metadata
  var stationSource = 'https://erc.epa.ie/air_upgrade/dcc/geojson.php';
  var stations = await new Promise((resolve, reject) => {
    request(stationSource, (error, response, body) => {
      if (error) reject(error);
      if (response.statusCode !== 200) {
        return cb(error || response);
      }
      resolve(body);
    });
  });
  stations = fetchMetadata(stations);

  var tasks = [];
  _.forEach(stations, function (s) {
    var task = function (cb) {
      request(source.url + 'station=' + s.location, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        cb(null, [body, s]);
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
 * Takes the data for each station, and parses it into usable metadata for station
 * @param {array} results Fetched source data for metadata
 * @return {object} Parsed and standarized metadata
 */
var fetchMetadata = function (results) {
  try {
    results = JSON.parse(results);
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }
  /**
   * Takes the string of an address  returns the city from the adres
   * @param {string} cityString the string of the address
   * @return {string} Parsed address to a city
   */
  var fetchCity = (cityString) => {
    var address = String(cityString).split(', ');
    cityString = address[address.length - 1];
    if (cityString.search('Cork') !== -1) {
      return 'Cork';
    } else if (cityString.substring(0, 2) === 'Co') {
      return cityString.replace('Co', '').replace('.', '').trim();
    } else if (cityString.search('Dublin') !== -1) {
      return 'Dublin';
    } else if (/\d/.test(address)) {
      return address[address.length - 2];
    }
    return cityString.trim();
  };

  return results.features.map(s => { 
    return {
      location: s.properties.AQStation,
      coordinates: s.geometry.coordinates,
      city: fetchCity(s.properties['On Ground Location'])
    };
  });
}

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
var formatData = function (results) {
  /**
   * Takes the entries and headers of a table html, and parses them into json in correct format
   * @param {array} header array of headers
   * @param {array} entries array of entries
   * @return {object} object of valid values parsed from a row and the header
   */
  const parseRow = function (header, entries) {
    var headers = [...header];
    var dataObj = {};
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].search('Value') !== -1) {
        dataObj['unit'] = headers[i].substring(headers[i].indexOf('(') + 1, headers[i].indexOf(')'));
        headers[i] = 'value';
      }
      dataObj[headers[i]] = entries[i];
    }
    var average = 1;
    if (dataObj['value'].search(/\*/) === dataObj['value'].length - 1) average = 8;
    if (dataObj['value'].search(/\*/) === dataObj['value'].length - 2) average = 24;
    dataObj['average'] = average;
    dataObj['value'] = Number(dataObj['value'].replace(/\*/g, ''));
    dataObj['Date'] = moment(dataObj['Date'], 'Do MMM hh:mm').tz('Europe/Dublin');
    return dataObj;
  };
  // Runs through the table to find headers and then values to fetch
  var measurements = [];
  results.forEach(s => {
    const $ = cheerio.load(s[0]);
    var stationTemplate = {
      location: s[1].location,
      city: s[1].city,
      coordinates: {
        latitude: s[1].coordinates[0],
        longitude: s[1].coordinates[0]
      },
      attribution: [{name: 'epa.ie', url: 'https://www.epa.ie/'}]
    };
    $('table').each((i, e) => {
      var headers = [];
      $('thead', $(e)).each((i, e) => {
        $('th', $(e)).each((i, e) => {
          headers.push($(e).text());
        });
      });
      $('tbody', $(e)).each((i, e) => {
        $('tr', $(e)).each((i, e) => {
          var entries = [];
          $('td', $(e)).each((i, e) => {
            entries.push($(e).text().trim());
          });
          const rowData = parseRow(headers, entries);
          var m = Object.assign({
            value: rowData['value'],
            unit: rowData['unit'],
            parameter: rowData['Pollutant'],
            date: {
              utc: rowData['Date'].toDate(),
              local: rowData['Date'].format()
            },
            averagingPeriod: {unit: 'hours', value: rowData['average']}
          }, stationTemplate);
          m = unifyMeasurementUnits(m);
          m = unifyParameters(m);
          measurements.push(m);
        });
      });
    });
  });
  return {
    name: 'unused',
    measurements: measurements
  };
};
