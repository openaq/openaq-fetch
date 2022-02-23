/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Montenegrin data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { removeUnwantedParameters, unifyMeasurementUnits, unifyParameters } from '../lib/utils';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import async from 'async';
import cheerio from 'cheerio';

// Adding in certs to get around unverified connection issue
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'montenegro';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = async function (source, cb) {
  // Fetches pages with valid data
  var tasks = [];

  // First finds pages that has data, some of these pages may give a nullresponse, so I have to add all the other sites instead
  for (let i = 1; i < 20; i++) {
    try {
      // Tests if method works
      await new Promise((resolve, reject) => {
        request(source.url + i, (error, response, body) => {
          if (error) reject(new Error(error));
          if (response.statusCode !== 200) {
            reject(new Error('Invalid status code <' + response.statusCode + '>'));
          }
          resolve(body);
        });
      });
      var task = function (cb) {
        request(source.url + i, function (err, res, body) {
          if (err || res.statusCode !== 200) {
            return cb(err || res);
          }
          cb(null, body);
        });
      };
      tasks.push(task);
    } catch (e) {
      continue;
    }
  }

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
      console.log(e);
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
  /**
   * Given a string and the template json object, parses the string into coordinates, location and city
   * and adds it to the template
   * @param {string} location String containing coordinates, city and location
   * @param {object} template Object to add the parsed values to
   */
  var parseLocation = (location, template) => {
    location = location.split('|');
    var city = location[0].split(',');
    template['city'] = city[0].trim();
    template['location'] = (city.length === 1) ? city[0].trim() : city[1].trim();
    var coordinates = location[1].replace('Geolokacija:', '').split(',');
    coordinates = {
      latitude: Number(coordinates[0]),
      longitude: Number(coordinates[1])
    };
    template['coordinates'] = coordinates;
  };
  /**
   * Given a string and the template json object, parses a string into a moment object
   * and adds it to the template
   * @param {string} date String containing the data
   * @param {object} template Object to add the parsed values to
   */
  var parseDate = (date, template) => {
    date = date.replace('Pregled mjerenja za', '').replace('h', '');
    const dateMoment = moment.tz(date, 'DD.MM.YYYY HH:mm', 'Europe/Podgorica');
    date = {
      utc: dateMoment.toDate(),
      local: dateMoment.format()
    };
    template['date'] = date;
  };
  /**
   * Given a string and a measurement json object, parses the string into value and unit
   * and adds it to the measurement object
   * @param {string} value String value and unit
   * @param {object} measurement Object to add the parsed values to
   */
  var parseValueAndUnit = (value, measurement) => {
    value = value.replace(/<|>/gi, '').trim();
    var splitPos = -1;
    // For some reason JS can not recognize the space between value and parameter, so I have to find the first letter
    for (let i = 0; i < value.length; i++) {
      if (value.charAt(i).toLowerCase() !== value.charAt(i).toUpperCase()) {
        splitPos = i;
        break;
      }
    }
    measurement['unit'] = value.substring(splitPos);
    measurement['value'] = Number(value.substring(0, splitPos).replace(',', '.').trim());
  };
  var measurements = [];
  // loops through all sites
  results.forEach(p => {
    let $ = cheerio.load(p);
    // base template of object
    let template = {
      attribution: [{name: 'epa.me', url: 'https://epa.org.me/'}],
      averagingPeriod: {unit: 'hours', value: 1}
    };
    // Finds the location and date string
    $('.col-6.col-12-medium').each((i, e) => {
      $('h6 a', e).each((i, e) => {
        if ($(e).text().search('|') !== -1 && $(e).text().charAt(0) !== '*') {
          parseLocation($(e).text(), template);
        }
      });
      $('h4', e).each((i, e) => {
        if ($(e).text().search('Pregled mjerenja za') !== -1) {
          parseDate($(e).text(), template);
        }
      });
    });
    let parameterIndex = -1;
    let valueIndex = -1;
    // finds the index of value and parameter
    $('.sortable thead th').each((i, e) => {
      if ($(e).text().search('Oznaka') !== -1) {
        parameterIndex = i;
      }
      if ($(e).text().search('Koncentracija') !== -1) {
        valueIndex = i;
      }
    });
    // loops through all the parameters and values and adds them to a measurement and adds it to measurements
    $('.sortable tbody tr').each((i, e) => {
      if (parameterIndex !== -1 && valueIndex !== -1) {
        var m = Object.assign({'parameter': $($('td', e).get(parameterIndex)).text()}, template);
        var value = $($('td', e).get(valueIndex)).text();
        parseValueAndUnit(value, m);
        m = unifyMeasurementUnits(m);
        m = unifyParameters(m);
        measurements.push(m);
      }
    });
  });
  // removes unwanted parameters such as C6H6
  measurements = removeUnwantedParameters(measurements);
  return {
    name: 'unused',
    measurements: measurements
  };
};
