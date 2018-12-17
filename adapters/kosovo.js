/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for a Kosovo sources (HTML page)
 */
'use strict';

const moment = require('moment-timezone');
const request = require('request-promise-native');
const cheerio = require('cheerio');

const log = require('../lib/logger');

const openaq_parameters = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co', 'bc'];

const averagingPeriod = { unit: 'hours', value: 1 };
const attribution = [{ name: 'Kosovo AQ', url: 'http://kosovo-airquality.com/secure/index2.html' }];
const staticData = {
  Drenas : {
    coordinates : { // 42.62551717860738,20.896225734037785
      latitude : 42.62552,
      longitude : 20.89623
    },
    city : 'Drenas'
  },
  Gjilan : {
    coordinates : { // 42.46100366178403,21.467255332788113
      latitude : 42.46100,
      longitude : 21.46726
    },
    city : 'Gjilan'
  },
  'Hani i Elezit' : {
    coordinates : { // 42.153772879592786,21.296323467845127
      latitude : 42.15377,
      longitude : 21.29632
    },
    city : 'Hani i Elezit'
  },
  Mitrovice : {
    coordinates : { //  42.89165029364315,20.868949929916425
      latitude : 42.89165,
      longitude : 20.86895
    },
    city : 'Mitrovice'
  },
  Peje : {
    coordinates : { //  42.65959450714422,20.284551553936808
      latitude : 42.65959,
      longitude : 20.28455
    },
    city : 'Peje'
  },
  'Prishtine - IHMK' : {
    coordinates : { // 42.64869532066342,21.1371357574585
      latitude : 42.64869,
      longitude : 21.13714
    },
    city : 'Prishtine'
  },
  'Prishtine, Rilindje' : {
    coordinates : { // 42.65939498964757,21.157230867398084
      latitude : 42.65939,
      longitude : 21.157230
    },
    city : 'Prishtine'
  },
  Prizren : {
    coordinates : { // 42.21585246455938,20.741575823942526
      latitude : 42.215852,
      longitude : 20.74158
    },
    city : 'Prizren'
  }
};

function getKosovoAQlatestRawJSON(html) {
  return cheerio.load(html);
}

function getKosovoAQHTML(url) {
  return new Promise(function(resolve, reject) {
  return request(url)
    .then(html => resolve(html))
    .catch(error => reject(error));
  });
}

function getParameterAndUnit(header) {
  const parunit = header.split('[');
// header.substring(0, header.indexOf('['))
  const parameterUnit = {
    parameter : parunit[0].toLowerCase().replace('.', ''),
    unit : parunit[1].toLowerCase().replace(']', '')
  };
  return parameterUnit;
}

function getParameters(rawParameters) {
  return rawParameters.map(rawParameter => getParameterAndUnit(rawParameter));
}

function getDate(rawDate) {
  const dateMoment = moment.tz(rawDate, 'DD.MM.YYYY HH:mm:ss', 'Europe/Belgrade'); // No name for Pristina?
  return {
    utc : dateMoment.toDate(),
    local : dateMoment.format()
  };
}

function getStation(rawStation, headers) {
  const station = {};
  headers.forEach((property, index) => rawStation[index] ? station[property] = rawStation[index] : null);
  return station;
}

function getRow(tr) {
  const tds = tr.filter(column => column.name === 'td');
  const row = tds.map(td => td.children && td.children.length > 0 ? td.children[0].data : null);
  return row;
}

function getStationMeasurements(rawStation, parameters) {
  const location = rawStation.shift();
  const measurement = {
    location : location,
    city : staticData[location].city,
    date : getDate(rawStation.shift()),
    coordinates : staticData[location].coordinates,
    attribution : attribution,
    averagingPeriod : averagingPeriod
  };

  const stationMeasurements = [];
  rawStation.forEach((rawMeasurement, index) => {
    if (rawMeasurement)
        stationMeasurements.push(Object.assign({
          parameter : parameters[index].parameter,
          unit : parameters[index].unit,
          value : Number(rawMeasurement.replace(',', '.'))
        }, measurement));
  });
  return stationMeasurements;
}

function getMeasurements(rawStations, parameters) {
  const measurements = [];
  rawStations.forEach((rawStation) =>
    measurements.push(...getStationMeasurements(rawStation, parameters))
  );
  return measurements;
}

function getTable(rawData) {
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

  const measurements = getMeasurements(rawStations, parameters)
  log.debug('--------------- stations -------------');
  log.debug(measurements);
  return measurements;
}

async function getKosovoAQ(source) {
  return new Promise(function(resolve, reject) {
    getKosovoAQHTML(source.url)
    .then(html => {
      log.debug('--------------- html -------------');
      log.debug(html);
      const rawJSON = getKosovoAQlatestRawJSON(html);
      log.debug('--------------- raw JSON -------------');
      log.debug(rawJSON);
      // jo2: Probably should use JSONata or something similar to do a query for the root data object.
      // As long as the source HTML page structure is not modified, this should work.
      const rawTable = rawJSON._root.children[2].children[2].children[4].children[1].children[5].children[1].children[1].children[1];

      log.debug('--------------- raw JSON table -------------');
      log.debug(rawTable);
      const table = getTable(rawTable).filter(measurement => openaq_parameters.includes(measurement.parameter));
      resolve({ name : module.exports.name, measurements : table });
    })
    .catch(error => reject(error));
  });
}

module.exports.name = 'kosovo';

module.exports.fetchData = async function(source, callback) {
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
