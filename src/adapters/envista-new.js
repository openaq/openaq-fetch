'use strict';

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as moment } from 'moment';
const { difference, flattenDeep } = pkg;
import pkg from 'lodash';
import { parallel, parallelLimit } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils.js';

const requestHeaders = baseRequest.defaults({
  timeout: REQUEST_TIMEOUT,
  rejectUnauthorized: false, // set due to self-signed cert
  strictSSL: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:54.0) Gecko/20100101 Firefox/54.0',
    'Accept': 'text/html,application/json,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Content-Type': 'text/html; charset=utf-8',
    'envi-data-source': 'MANA',
    'Authorization': 'ApiToken ' + '1cab20bf-0248-493d-aedc-27aa94445d15'
  }
});

export const name = 'envista-new';

export function fetchData (source, cb) {
  let regionListUrl = source.url + 'regions';
  requestHeaders(regionListUrl, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    let tasks = [];
    const regionList = JSON.parse(body);
    regionList.forEach(region => {
      tasks.push(handleRegion(source, region));
    });

    parallel(tasks, (err, results) => {
      if (err) {
        return cb(err, []);
      }
      results = flattenDeep(results);
      results = convertUnits(results);
      // console.log(results);
      return cb(err, {name: 'unused', measurements: results});
    });
  });
}

const handleRegion = function (source, region) {
  let stationList = region.stations;
  return function (done) {
    let tasks = [];
    stationList.forEach(station => {
      if (station.active && hasAcceptedParameters(station)) {
        tasks.push(handleStation(source, region.name, station));
      }
    });

    parallelLimit(tasks, 16, (err, results) => { //  Magic number to avoid rate limiting is 16.
      if (err) {
        return done(err, []);
      }
      return done(null, results);
    });
  };
};

const handleStation = function (source, regionName, station) {
  return function (done) {
    let stationUrl = source.url + 'stations/' + station.stationId + '/data/latest';  
    requestHeaders(stationUrl, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      const data = JSON.parse(body);
      try {
        formatData(source, regionName, station, data, (measurements) => {
          return done(null, measurements);
        });
      } catch (err) {
        return done(null, []);
      }
    });
  };
};

const formatData = function (source, regionName, station, data, cb) {
  const base = {
    location: station.name,
    city: regionName,
    coordinates: {
      latitude: Number(station.location.latitude),
      longitude: Number(station.location.longitude)
    },
    averagingPeriod: {unit: 'hours', value: 0.25}, // Believed to update every 15 minutes
    attribution: [{
      name: source.organization,
      url: source.url
    }]
  };

  const measurements = data.data.map(datapoint => formatChannels(base, station, datapoint));
  return cb(measurements);
};

const formatChannels = function (base, station, datapoint) {
  base.date = getDate(datapoint.datetime);
  const datapoints = datapoint.channels.map(channel => {
    if (isAcceptedParameter(channel.name)) {
      return getMeasurement(base, station, channel);
    }
  });
  const filteredData = datapoints.filter(point => (point)); // removes undefined/invalid measurements
  return filteredData;
};

const hasAcceptedParameters = function (station) {
  const stationParameters = station.monitors.map(monitor => monitor.name.toLowerCase());
  const stationAcceptableParameters = difference(acceptableParameters, stationParameters);
  return Boolean(stationAcceptableParameters);
};

const isAcceptedParameter = function (parameter) {
  return acceptableParameters.includes(parameter.toLowerCase());
};

const getMeasurement = function (base, station, channel) {
  let measurement = Object.assign({}, base);
  let parameterName = channel.name.toLowerCase();
  measurement.parameter = parameterName;
  measurement.value = channel.value;
  measurement.unit = getUnit(station, channel);
  return measurement;
};

const getUnit = function (station, channel) {
  return station.monitors.find(monitor => monitor.channelId === channel.id).units;
};

const getDate = function (s) {
  const date = moment(s);
  return {utc: date.toDate(), local: date.format()};
};