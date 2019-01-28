/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for a Kosovo sources (HTML page)
 *
 * Please note:
 * There seems to be a discrepancy between the measurements value in the Web-pages for map and table.
 * Here we use the data from the table Web-page.
 */
'use strict';

import {
  REQUEST_TIMEOUT
} from '../lib/constants';
import {
  acceptableParameters
} from '../lib/utils';

const moment = require('moment-timezone');
const baseRequest = require('request-promise-native');
const request = baseRequest.defaults({
  timeout: REQUEST_TIMEOUT
});
const cheerio = require('cheerio');
const log = require('../lib/logger');

module.exports.name = 'kosovo';

module.exports.fetchData = async function (source, callback) {
  log.debug('fetchData', source);
  try {
    var result = await getKosovoAQ(source);
    log.debug(result);
    return callback(null, result);
  } catch (error) {
    console.error('Error: ' + error);
    return callback(error);
  }
};

const averagingPeriod = {
  unit: 'hours',
  value: 1
};
const attribution = [{
  name: 'Kosovo AQ',
  url: 'http://kosovo-airquality.com/secure/index2.html'
}];

// geo locations source: http://kosovo-airquality.com/secure/Kosovo.html
const staticData = {
  Drenas: {
    coordinates: {
      latitude: 42.625568,
      longitude: 20.89621
    },
    city: 'Drenas'
  },
  Gjilan: {
    coordinates: {
      latitude: 42.461143,
      longitude: 21.467201
    },
    city: 'Gjilan'
  },
  'Hani i Elezit': {
    coordinates: {
      latitude: 42.153961,
      longitude: 21.29601
    },
    city: 'Hani i Elezit'
  },
  Mitrovice: {
    coordinates: {
      latitude: 42.891794,
      longitude: 20.868936
    },
    city: 'Mitrovice'
  },
  Peje: {
    coordinates: {
      latitude: 42.659691,
      longitude: 20.284598
    },
    city: 'Peje'
  },
  'Prishtine - IHMK': {
    coordinates: {
      latitude: 42.648872,
      longitude: 21.137121
    },
    city: 'Prishtine'
  },
  'Prishtine, Rilindje': {
    coordinates: {
      latitude: 42.659656,
      longitude: 21.157309
    },
    city: 'Prishtine'
  },
  Prizren: {
    coordinates: {
      latitude: 42.215859,
      longitude: 20.741556
    },
    city: 'Prizren'
  }
};

function getKosovoAQlatestRawJSON (html) {
  return cheerio.load(html);
}

function getKosovoAQHTML (url) {
  return new Promise(function (resolve, reject) {
    return request(url)
      .then(html => resolve(html))
      .catch(error => reject(error));
  });
}

function getParameterAndUnit (header) {
  const parunit = header.split('[');
  const parameterUnit = {
    parameter: parunit[0].toLowerCase().replace('.', ''),
    unit: parunit[1].toLowerCase().replace(']', '')
  };
  return parameterUnit;
}

function getParameters (rawParameters) {
  return rawParameters.map(rawParameter => getParameterAndUnit(rawParameter));
}

function getDate (rawDate) {
  const dateMoment = moment.tz(rawDate, 'DD.MM.YYYY HH:mm:ss', 'Europe/Belgrade'); // No name for Pristina?
  return {
    utc: dateMoment.toDate(),
    local: dateMoment.format()
  };
}

function getRow (tr) {
  const tds = tr.filter(column => column.name === 'td');
  const row = tds.map(td => td.children && td.children.length > 0 ? td.children[0].data : null);
  return row;
}

function getStationMeasurements (rawStation, parameters) {
  const location = rawStation.shift();
  const measurement = {
    location: location,
    city: staticData[location].city,
    date: getDate(rawStation.shift()),
    coordinates: staticData[location].coordinates,
    attribution: attribution,
    averagingPeriod: averagingPeriod
  };

  const stationMeasurements = [];
  rawStation.forEach((rawMeasurement, index) => {
    if (rawMeasurement) {
      stationMeasurements.push(Object.assign({
        parameter: parameters[index].parameter,
        unit: parameters[index].unit,
        value: Number(rawMeasurement.replace(',', '.'))
      }, measurement));
    }
  });
  return stationMeasurements;
}

function getMeasurements (rawStations, parameters) {
  const measurements = [];
  rawStations.forEach((rawStation) =>
    measurements.push(...getStationMeasurements(rawStation, parameters))
  );
  return measurements;
}

function getTable (rawData) {
  const trs = rawData.children.filter(child => child.name === 'tr');
  log.debug('--------------- raw rows -------------');
  log.debug(trs);
  const rawHeaders = trs.shift();
  let headers = getRow(rawHeaders.children);
  headers.splice(0, 2); // Remove station and date header columns.
  log.debug('--------------- headers -------------');
  log.debug(headers);
  const parameters = getParameters(headers);
  log.debug('--------------- parameters -------------');
  log.debug(parameters);
  const rawStations = trs.map(tr => getRow(tr.children));
  log.debug('--------------- raw stations -------------');
  log.debug(rawStations);

  const measurements = getMeasurements(rawStations, parameters);
  log.debug('--------------- stations -------------');
  log.debug(measurements);
  return measurements;
}

async function getKosovoAQ (source) {
  return new Promise(function (resolve, reject) {
    getKosovoAQHTML(source.url)
      .then(html => {
        log.debug('--------------- html -------------');
        log.debug(html);
        const rawJSON = getKosovoAQlatestRawJSON(html);
        log.debug('--------------- raw JSON -------------');
        log.debug(rawJSON);
        const rawTable = rawJSON('table[BORDER=2]').find('tbody').get(0);

        log.debug('--------------- raw JSON table -------------');
        log.debug(rawTable);
        const table = getTable(rawTable).filter(measurement => acceptableParameters.includes(measurement.parameter));
        resolve({
          name: module.exports.name,
          measurements: table
        });
      })
      .catch(error => reject(error));
  });
}
