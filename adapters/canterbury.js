/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the data sources from New Zealand.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import { unifyMeasurementUnits, unifyParameters } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import async from 'async';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'canterbury';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  // Fetches all data for each station for today, data is for each 10 minutes
  var tasks = Object.keys(stations).map(key => {
    const date = moment().date() + '%2F' + moment().month() + '%2F' + moment().year();
    const url = source.url.replace('$station', key).replace('$date', date).replace('$date', date);
    return function (cb) {
      request(url, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        cb(null, [body, stations[key]]);
      });
    };
  });
  // Runs through all of the tasks in parallel
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
  var measurements = [];
  // Legal types, for some reason the JSON converts signs and spaces into unicode,
  // and data has wind and temperature data also, which needs to be filtered out
  var legalParams = ['PM10', 'PM2.5', 'SO2', 'CO', 'NO2', 'O3'];
  results.forEach(r => {
    const template = {
      city: r[1].city,
      location: r[1].location,
      coordinates: r[1].coordinates,
      attribution: [{name: 'Environment Canterbury', url: 'https://ecan.govt.nz/'}],
      averagingPeriod: {unit: 'hours', value: 0.166666} // this should be aproximate to 10 minutes, not sure if this is OK
    };
    // Parses the data from the site
    r[0] = JSON.parse(r[0]);
    // Runs through all data items for the site
    r[0].data.item.forEach(d => {
      // Gets the datemoment and correct timezone of time from item
      const dateMoment = moment.tz(d.DateTime, 'Pacific/Auckland');
      var measurement = Object.assign({
        'date': {
          utc: dateMoment.toDate(),
          local: dateMoment.format()
        }
      }, template);
      // Filters out all unwanted data, and then runs through all keys
      Object.keys(d).filter(m => {
        for (let p of legalParams) {
          if (m.search(p) !== -1) {
            return true;
          }
        }
        return false;
      }).forEach(m => {
        // Part of key is the measurement, substring until the first letter of _, to find parameter
        measurement.parameter = m.substr(0, m.indexOf('_'));
        measurement.value = Number(d[m]);
        // All data is in ug/m3, except CO, which is mg/m3
        measurement.unit = (measurement.parameter !== 'CO') ? 'ug/m3' : 'mg/m3';
        // Unifies measurement units and parameters before adding them
        measurement = unifyMeasurementUnits(measurement);
        measurement = unifyParameters(measurement);
        measurements.push(measurement);
      });
    });
  });
  return {
    name: 'unused',
    measurements: measurements
  };
};
/* There are a lot of more stations, but they dont seem to be reporting for some reason,
  Managed to find the coordinates from this site: https://ecan.govt.nz/data/air-quality-data/,
  according to main source site, there should be atleast 30 stations, but none of them are sadly report by the date of 24/06/2020
*/
const stations = {
  '1': {
    location: 'St Albans',
    city: 'Christchurch',
    coordinates: {
      latitude: -43.511257,
      longitude: 172.6337
    }
  },
  '2': {
    location: 'Riccarton Road',
    city: 'Christchurch',
    coordinates: {
      latitude: -43.530356,
      longitude: 172.589048
    }
  },
  '3': {
    location: 'Woolston',
    city: 'Christchurch',
    coordinates: {
      latitude: -43.557532,
      longitude: 172.681343
    }
  },
  '4': {
    location: 'Kaiapoi',
    city: 'Kaiapoi',
    coordinates: {
      latitude: -43.384643,
      longitude: 172.6520
    }
  },
  '5': {
    location: 'Rangiora',
    city: 'Rangiora',
    coordinates: {
      latitude: -43.307439,
      longitude: 172.594745
    }
  },
  '7': {
    location: 'Ashburton',
    city: 'Ashburton',
    coordinates: {
      latitude: -43.912238,
      longitude: 171.7552
    }
  },
  '9': {
    location: 'Geraldine',
    city: 'Geraldine',
    coordinates: {
      latitude: -44.100188,
      longitude: 171.241443
    }
  },
  '10': {
    location: 'Anzac Square',
    city: 'Timaru',
    coordinates: {
      latitude: -44.404486,
      longitude: 171.249643
    }
  },
  '64': {
    location: 'Waimate Kennedy',
    city: 'Waimate',
    coordinates: {
      latitude: -44.732595,
      longitude: 171.049778
    }
  },
  '77': {
    location: 'Washdyke Alpine',
    city: 'Timaru',
    coordinates: {
      latitude: -44.356199,
      longitude: 171.242334
    }
  }
};
