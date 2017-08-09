'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { parallel } from 'async';
import { flattenDeep } from 'lodash';
import { acceptableParameters, convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'buenos-aires';
const timezone = 'America/Argentina/Buenos_Aires';

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
      };
    }).get();

    const parameters = $('#contaminante option').filter(function (i, el) {
      return $(this).attr('value') !== '';
    }).filter(function (i, el) {
      return acceptableParameters.indexOf($(this).text().toLowerCase()) !== -1;
    }).map(function (i, el) {
      return {
        id: $(this).attr('value'),
        name: $(this).text()
      };
    }).get();

    const today = moment.tz(timezone)
      .hours(0)
      .minutes(0)
      .seconds(0)
      .milliseconds(0);
    stations.forEach((station) => {
      parameters.forEach((parameter) => {
        const url = makeStationQuery(source.url, station, parameter, today);
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
}

const makeStationQuery = (sourceUrl, station, parameter, date) => {
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

const formatData = (body, station, parameter, today) => {
  const $ = cheerio.load(body);
  let measurements = [];

  const averagingPeriod = getAveragingPeriod(parameter);
  const unit = getUnit(parameter);
  const coordinates = getCoordinates(station);
  parameter = parameter.toLowerCase();

  $('#grafico table td[valign=bottom] img').each(function (i, el) {
    const title = $(this).attr('title');
    const match = title.match(/([\d.]*) - ([\d]*) hs/);
    const value = Number(match[1]);
    const hours = Number(match[2]);
    const date = getDate(today, hours);

    let m = {
      location: station,
      value: value,
      unit: unit,
      parameter: parameter,
      averagingPeriod: averagingPeriod,
      date: date,
      coordinates: coordinates,
      attribution: [{
        name: 'Buenos Aires Ciudad, Agencia de Protección Ambiental',
        url: 'http://www.buenosaires.gob.ar/agenciaambiental/monitoreoambiental'
      }]
    };
    measurements.push(m);
  });
  return measurements;
};

const getDate = (today, hours) => {
  let date = moment.tz(today, timezone);
  if (hours >= 13 && hours <= 23) {
    date.subtract(1, 'days');
  }
  date = date.hours(hours);
  return {
    utc: date.toDate(),
    local: date.format()
  };
};

const getCoordinates = (station) => {
  switch (station) {
    case 'CENTENARIO':
      return {
        longitude: -58.43194,
        latitude: -34.60638
      };
    case 'CORDOBA':
      return {
        longitude: -58.39165,
        latitude: -34.60441667
      };
    case 'LA BOCA':
      return {
        longitude: -58.36555,
        latitude: -34.62527
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
