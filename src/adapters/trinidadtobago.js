/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for data sources for Trindidad and Tobago
 * adapted from magnus' code @magsyg PR #754 OpenAQ Fetch repo
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import { unifyParameters, unifyMeasurementUnits, removeUnwantedParameters, acceptableParameters } from '../lib/utils.js';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import async from 'async';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'trinidadtobago';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
export function fetchData (source, cb) {
  // Fetch both the measurements and meta-data about the locations
  // List of keys for parameters used in url
  let parameterIDs = ['3', '1465', '2130', '18', '20', '23'];
  let tasks = [];
  // Loops through all the stations, and then loops through all parameters IDS, and adds the requests to the tasks
  _.forEach(stations, function (e) {
    for (let i in parameterIDs) {
      const sourceURL = source.url.replace('$station', e.key).replace('$parameter', parameterIDs[i]) + moment().valueOf();
      let task = function (cb) {
        // Have to use Jar true here, because if it does not have it, it will get stuck in a redirect loop
        request({jar: true, url: sourceURL}, function (err, res, body) {
          if (err || res.statusCode !== 200) {
            return cb(err || res);
          }
          // Adds body and metadata result to callback
          cb(null, {meta: e, values: body});
        });
      };
      tasks.push(task);
    }
  });

  async.parallel(tasks, function (err, results) {
    if (err) {
      return cb({message: 'Failure to load data urls.'});
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      let data = formatData(results);
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

let formatData = function (results) {
  let measurements = [];
  /**
   * Formats the string result of values into JSON, or undefined if values are empty or something fails
   * @param {array} data Object of a combination of metadata and values
   * @return {object} Parsed values into JSON or unddefines if values are empty or something fails
   */
  const parseToJSON = (data) => {
    try {
      data['values'] = JSON.parse(data.values);
      if (Object.keys(data['values']).length === 0) {
        data = undefined;
      }
    } catch (e) {
      data = undefined;
    }
    return data;
  };
  // Loops through all items
  results.forEach(item => {

    item = parseToJSON(item);
    // If values are empty or something fails, dont run
    if (item !== undefined) {
      const template = {
        city: item.meta.city,
        location: item.meta.location,
        parameter: Object.keys(item.values)[0],
        coordinates: {
          latitude: Number(item.meta.latitude),
          longitude: Number(item.meta.longitude)
        },
        attribution: [{name: 'EMA', url: 'https://ei.weblakes.com/RTTPublic/DshBrdAQI'}],
        averagingPeriod: {unit: 'hours', value: 1}
      };
      // Units are mostly ug/m3, but CO is mg/m3, according to site
      template['unit'] = (template['parameter'] === 'CO') ? 'mg/m3' : 'ug/m3';
      // Loops through the latest data for 24 hours, data is hourly
      for (let i in item.values[template.parameter]) {
        // Do not add values if values are Null
        if (item.values[template.parameter][i] !== null) {
          let m = Object.assign({value: item.values[template['parameter']][i]}, template);
          // Adds the formated date
          const dateMoment = moment.tz(item.values.xlabels[i], 'YYYY-MM-DD HH', 'America/Port_of_spain');
          m['date'] = {
            utc: dateMoment.toDate(),
            local: dateMoment.format()
          };
          // unifies parameters and measurement units
          m = unifyParameters(m);
          m = unifyMeasurementUnits(m);
          measurements.push(m);
        }
      }
    }
  });
  
  // corrects the parameter names
  measurements = correctMeasurementParameter(measurements);
  // filters out the measurements that are not the latest
  measurements = getLatestMeasurements(measurements);

  return {
    name: 'unused',
    measurements: measurements
  };
};

function correctMeasurementParameter(measurements) {
  
    measurements.forEach(measurement => {
      if (measurement.parameter === "pm-10") {
        measurement.parameter = "pm10";
      } 
      else if (measurement.parameter === "pm-25") {
        measurement.parameter = "pm25";
      }
    });
        return measurements;
  }
 
  
function getLatestMeasurements(measurements) {
    const latestMeasurements = {};
    
    measurements.forEach((measurement) => {
      const key = measurement.parameter + measurement.location;
      if (!latestMeasurements[key] || measurement.date.local > latestMeasurements[key].date.local) {
        latestMeasurements[key] = measurement;
      }
    });
  
    return Object.values(latestMeasurements);
  }

const stations = [

  {
    key: '16',
    city: 'Couva',
    location: 'Point Lisas',
    latitude: 10.41603,
    longitude: -61.47468
  },
  {
    key: '19',
    city: 'Port of Spain',
    location: 'Port of Spain',
    latitude: 10.64256,
    longitude: -61.49406
  },
  {
    key: '47',
    city: 'Scaroborough',
    location: 'Signal Hill',
    latitude: 11.17455,
    longitude: -60.76007
  },
  {
    key: '50',
    city: 'San Fernando',
    location: 'San Fernando',
    latitude: 10.26801,
    longitude: -61.46705
  },
  {
    key: '52',
    city: 'Arima',
    location: 'Arima',
    latitude: 10.64849,
    longitude: -61.28440
  }

];