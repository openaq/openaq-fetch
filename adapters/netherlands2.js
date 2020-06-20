/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Dutch data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';
import {removeUnwantedParameters, unifyParameters} from '../lib/utils'
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import async from 'async';

// Adding in certs to get around unverified connection issue
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'netherlands2';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = async function (source, cb) {
  // First fetches the number of pages of stations
  var totalStations = await new Promise((resolve, reject) => {
    request(source.url+'/stations/', (error, response, body) => {
        if (error) reject(error);
        if (response.statusCode != 200) {
          return cb({message: 'Failure to load data urls.'});
        }
        resolve(body);
    });
  });
  totalStations = JSON.parse(totalStations).pagination.last_page;
  // Then fetches all the stationsnumbers
  var stations = [];
  for(let i = 0; i < totalStations; i++) {
    var pageStations = await new Promise((resolve, reject) => {
      request(source.url+'/stations/?page='+(i+1), (error, response, body) => {
          if (error) reject(error);
          if (response.statusCode != 200) {
            return cb({message: 'Failure to load data url'});
          }
          resolve(body);
      });
    });
    var pageStations = JSON.parse(pageStations)
    pageStations.data.forEach(station => {
      stations.push(station.number)
    });
  }
  // Then creates tasks of fetching metadata and the data for each station
  const tasks = [];
  _.forEach(stations, function (e) {
    var task = function (cb) {
      request(source.url+'/stations/'+e, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        cb(null, body);
      });
    };
    tasks.push(task);
    task = function (cb) {
      request(source.url+'/stations/'+e+'/measurements', function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        cb(null, body);
      });
    };
    tasks.push(task);
  });
  // Then runs all thes tasks in parallel, gathers the data and sends it
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
  /**
   * Parses the metadata and the measurements and combines them into an easiliery read and parsed object  
   * @param {Object} metadata of a station 
   * @param {Object} data measurements of a station
   * @returns {Object} combined metadata and data for a statios
   */
  const parsedStationData = (metadata, data) => {
    try {
      data = JSON.parse(data);
      metadata = JSON.parse(metadata);
      return {
        data: data.data,
        latitude: Number(metadata.data.geometry.coordinates[1]),
        longitude: Number(metadata.data.geometry.coordinates[0]),
        location: metadata.data.location,
        city: metadata.data.municipality
      };
    } catch (e) {
      return null;
    }
  }
  // Loops through each pair of metadata and stations measurement and creates an object and adds them to the datalist
  const data = []
  for(let i = 0; i < results.length; i+=2) {
    const combinedData = parsedStationData(results[i],results[i+1]);
    if (combinedData != null) {
      data.push(combinedData);
    }
  }
  var measurements = [];
  // Loops through all stations
  data.forEach(item => {
    // Base object of a station
    const template = {
      city: item.city,
      location: item.location,
      coordinates: {
        latitude: item.latitude,
        longitude: item.longitude
      },
      unit: 'µg/m³', // sites says that all of the measurements are in this unit
      attribution: [{name: 'Luchtmeetnet', url: 'https://www.luchtmeetnet.nl/'}],
      averagingPeriod: {unit: 'hours', value: 1}
    }
    // Loops through all of the measurements from a station
    item.data.forEach(data => {
      // Adds 1 hour because timestamp is the start of an hourly average measurement
      var dateMoment = moment(data.timestamp_measured).add(1, 'hours');
      dateMoment = dateMoment.tz('Europe/Amsterdam');
      var m = Object.assign({
        parameter: data.formula,
        value: data.value,
        date: {
          utc: dateMoment.toDate(),
          local: dateMoment.format()
        },
      }, template)
      // Parses the parameters the correct format
      m = unifyParameters(m);
      measurements.push(m);
    });
  });
  // Removes unwanted parameters such as NO
  measurements = removeUnwantedParameters(measurements)
  return {
    name: 'unused',
    measurements: measurements
  };
};
