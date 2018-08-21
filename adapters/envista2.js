'use strict';

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as moment } from 'moment';
import { flattenDeep, isFinite } from 'lodash';
import { parallel, parallelLimit, retry } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';

const requestHeaders = baseRequest.defaults({
  timeout: REQUEST_TIMEOUT,
  rejectUnauthorized: false, // set due to self-signed cert
  strictSSL: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:54.0) Gecko/20100101 Firefox/54.0',
    'Accept': 'text/html,application/json,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Content-Type': 'text/html; charset=utf-8',
    'envi-data-source': 'MANA'
  }
});

export const name = 'envista2';

export function fetchData (source, cb) {
  let stationListUrl = source.url + 'stations';
  var options = {
    url: stationListUrl,
    headers: {
      'Authorization': 'ApiToken ' + source.apitoken
    }
  };  
  requestHeaders(options, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    let tasks = [];
    const stationData = JSON.parse(body);    
    for (var stationIndex = 0; stationIndex < stationData.length; stationIndex++) {
        tasks.push(handleStation(source, stationData[stationIndex]));
    }    
    
    parallel(tasks, (err, results) => {
      if (err) {
        return cb(err, []);
      }      
      results = flattenDeep(results);
      results = convertUnits(results);

      return cb(err, {name: 'unused', measurements: results});
    });
  });
}


const handleStation = function (source, station) {
  return function (done) {
    // TODO: Need to load whole day to ensure we grab everything at some point?
    let stationUrl = source.url + 'stations/' + station.stationId + "/data/daily";
    var options = {
      url: stationUrl,
      headers: {
        'Authorization': 'ApiToken ' + source.apitoken
      }        
    };
    requestHeaders(options, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      const data = JSON.parse(body);
      try {
        formatData(source, station, data, (measurements) => {
          return done(null, measurements);
        });
      } catch (err) {
        return done(null, []);
      }
    });      
  };
};


const formatData = function (source, station, data, cb) {
  const base = {
    location: station.name,
    coordinates: {
      latitude: Number(station.location.latitude),
      longitude: Number(station.location.longitude)
    },
    averagingPeriod: {unit: 'hours', value: 1.0/12.0}, // TODO: Correct? Measurements have 5 mins between them but unknown update freq.
    attribution: [{
      name: source.organization,
      url: source.url
    }]
  };    
  let measurements = [];
  let pm25 = Object.assign({}, base);  
  /* mockup */  
  pm25.date = getDate("2018-08-15T00:15:00+03:00");
  pm25.unit = "ppb";
  pm25.parameter = "pm25";
  pm25.value = Number("0.003");
  measurements.push(pm25);
  return cb(measurements);
};

const getDate = function (s) {
  const date = moment(s);
  return {utc: date.toDate(), local: date.format()};
};
