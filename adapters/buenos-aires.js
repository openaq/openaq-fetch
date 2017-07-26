'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { parallel } from 'async';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import { flattenDeep } from 'lodash';
import { acceptableParameters, convertUnits } from '../lib/utils';

export const name = 'buenos-aires';
export function fetchData (source, callback) {
  request.get(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return callback({message: 'Failed to load entry point url'}, null);
    }

    let tasks = [];
    let $ = cheerio.load(body);

    const stations = $('#estacion option').filter(function (i, el) {
      // skip non working station
      return $(this).text() !== 'PALERMO';
    }).filter(function (i, el) {
      return $(this).attr('value') !== '';
    }).map(function (i, el) {
      return {
        id: $(this).attr('value'),
        name: $(this).text()
      }
    }).get();
    
    const parameters = $('#contaminante option').filter(function (i, el) {
      return $(this).attr('value') !== '';
    }).filter(function (i, el) {
      return acceptableParameters.indexOf($(this).text().toLowerCase()) !== -1;
    }).map(function (i, el) {
      return {
        id: $(this).attr('value'),
        name: $(this).text()
      }
    }).get();

    const today = moment.tz('America/Argentina/Buenos_Aires');
    stations.forEach((station) => {
      parameters.forEach((parameter) => {
        const url = makeStationURL(source.url, station, parameter, today);
        tasks.push(handleStation(url, station.name, parameter.name, today));
      });
    });
    
    parallel(tasks, (err, results) => {
      if (err) {
        return callback(err, []);
      }

      results = flattenDeep(results);
      results = convertUnits(results);
       
      return callback(null, {name: 'unused', measurements: results});
    });
  });
};

const makeStationURL = (sourceUrl, station, parameter, date) => {
  const url = `${sourceUrl}contaminante=${parameter.id}&estacion=${station.id}&fecha_dia=${date.format('D')}&fecha_mes=${date.format('M')}&fecha_anio=${date.format('Y')}&menu_id=34234&buscar=Buscar`;
  return url;
};

const handleStation = (url, station, parameter, today) => {
  return (done) => {
    request(url, (err, response, body) => {
      if (err || response.statusCode !== 200) {
        return done(null, []);
      }

      const results = formatData(body, station, parameter, today);
      return done(null, results);
    });
  };
};

// makes coordinates and number (a unique id) used in requests
const getCoordinates = (station) => {
  switch (station) {
    case 'CENTENARIO':
      return {
        longitude: -34.60638,
        latitude: -58.43194
      };
    case 'CORDOBA':
      return {
        longitude: -34.60441667,
        latitude: -58.39165
      };
    case 'LA BOCA':
      return {
        longitude: -34.62527,
        latitude: -58.36555
      };
    default:
      break;
  }
};

const getUnit = (parameter) => {
  switch (parameter) {
    case 'CO':
      return 'ppm';
    case 'NO2':
      return 'ppb';
    case 'PM10':
      return 'µg/m3';
    default:
      break;
  }
};
const getAveragingPeriod = (parameter) => {
  switch (parameter) {
    case 'CO':
      return {unit: 'hours', value: 8};
    case 'NO2':
      return {unit: 'hours', value: 1};
    case 'PM10':
      return {unit: 'hours', value: 24};
    default:
      break;
  }
};

const formatData = (body, station, parameter, date) => {
  const $ = cheerio.load(body);
  let measurements = [];
  
  $('#grafico table td[valign=bottom] img').each(function (i, el) {
    const title = $(this).attr('title');
    const match = title.match(/([\d\.]*) - ([\d]*) hs/);
    const value = match[1];
    const hours = match[2];
    // handle the date
    // prev day 1300h -> to today 1200h
    let m = {
      location: station,
      value: Number(value),
      unit: getUnit(parameter),
      parameter: parameter.toLowerCase(),
      averagingPeriod: getAveragingPeriod(parameter),
      date: { utc: date.toDate(), local: date.format() }, // FIXME
      coordinates: getCoordinates(station),
      attribution: [{
        name: 'Buenos Aires Ciudad, Agencia de Protección Ambiental',
        url: 'http://www.buenosaires.gob.ar/agenciaambiental/monitoreoambiental/calidadaire'
      }]
    };
    measurements.push(m);
  });
  return measurements;
};
