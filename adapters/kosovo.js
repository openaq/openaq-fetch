/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for a Kosovo sources (HTML page)
 */
'use strict';

const moment = require('moment-timezone');
const fetch = require('node-fetch');
const parse5 = require('parse5');

const debug = false;

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

function debugLog(...args) {
  if (debug) console.log('KosovoAQ', ...args);
}

function getKosovoAQlatestRawJSON(html) {
  return parse5.parse(html, { sourceCodeLocationInfo : false });
}

function checkFetchStatus(response) {
  debugLog('Headers', response.headers.raw());

  debugLog('checkFetchStatus', response.ok, response.status, response.statusText);
  if (response.ok) { // res.status >= 200 && res.status < 300
      return response;
  } else {
      throw new Error(JSON.stringify({ status : response.status, statusText : response.statusText }));
  }
}

function getKosovoAQHTML(url, options) {
  return new Promise(function(resolve, reject) {
    fetch(url, options)
    .then(checkFetchStatus)
    .then(responseBody => {
      debugLog('openaqAPI', 'fetch responseBody', responseBody);
      resolve(responseBody.text());
    }, error => {
      console.error('openaq.js', 'openaqAPI', 'Error in checkFetchStatus', error);
      reject(error);
    })
    .catch(error => {
      console.error('openaq.js', 'openaqAPI','catch error', error);
      reject(error);
    });
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
  const tds = tr.filter(column => column.nodeName === 'td');
  const row = tds.map(td => td.childNodes && td.childNodes.length > 0 ? td.childNodes[0].value : null);
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
  const trs = rawData.childNodes.filter(child => child.nodeName === 'tr');
  debugLog(trs);
  const rawHeaders = trs.shift();
  let headers = getRow(rawHeaders.childNodes);
  headers.splice(0, 2); // Remove station and date header columns.
  debugLog('--------------- headers -------------');
  debugLog(headers);
  const parameters = getParameters(headers);
  debugLog('--------------- parameters -------------');
  debugLog(parameters);
  const rawStations = trs.map(tr => getRow(tr.childNodes));
  debugLog('--------------- raw stations -------------');
  debugLog(rawStations);

  const measurements = getMeasurements(rawStations, parameters)
  debugLog('--------------- stations -------------');
  debugLog(measurements);
  return measurements;
}

async function getKosovoAQ(source) {
  return new Promise(function(resolve, reject) {
    getKosovoAQHTML(source.url)
    .then(html => {
      debugLog('--------------- html -------------');
      debugLog(html);
      const rawJSON = getKosovoAQlatestRawJSON(html);
      debugLog('--------------- raw JSON -------------');
      debugLog(rawJSON);
      // jo2: Probably should use JSONata or something similar to do a query for the root data object.
      // As long as the source HTML page structure is not modified, this should work.
      const rawTable = rawJSON.childNodes[2].childNodes[2].childNodes[4].childNodes[1].childNodes[5].childNodes[1].childNodes[1].childNodes[1];
      debugLog('--------------- raw JSON table -------------');
      debugLog(rawTable);
      const table = getTable(rawTable).filter(measurement => openaq_parameters.includes(measurement.parameter));
      resolve({ name : module.exports.name, measurements : table });
    })
    .catch(error => reject(error));
  });
}

module.exports.name = 'kosovo';

module.exports.fetchData = async function(source, callback) {
  debugLog('fetchData', source);
  try {
    var result = await getKosovoAQ(source);
    debugLog(result);
    return callback(null, result);
  } catch (error) {
    console.error('Error: ' + error);
    return callback(error);
  }
};

/* For local & RunKit testing... */
const kosovoAQurl = 'http://kosovo-airquality.com/secure/ValueTable.html';
const testSource = { url : kosovoAQurl };

const RunKit = false;
if (RunKit) {
   var endpoint = require("@runkit/runkit/json-endpoint/1.0.0");
   endpoint(exports, async function() {
     var result = await getKosovoAQ(testSource);
     return result;
   });
}

if (debug)
   (async () => {
     module.exports.fetchData(testSource, (error, data) => {
       if (error) console.log(error);
       else console.log(data.measurements, data.name, data.measurements.length);
     });
   })();
