'use strict';

import client from '../lib/requests.js';
import { acceptableParameters, convertUnits } from '../lib/utils.js';
import { load } from 'cheerio';
import { parallel } from 'async';
import flattenDeep from 'lodash/flattenDeep.js';
import { DateTime } from 'luxon';

const timezone = 'America/Argentina/Buenos_Aires';

export const name = 'buenos-aires';

export function fetchData(source, callback) {
  client({ url: source.url, responseType: 'text' })
    .then((body) => {
      let tasks = [];
      let $ = load(body);

      const stations = $('#estacion option')
        .filter(function (i, el) {
          // skip non working station
          return $(this).text() !== 'PALERMO';
        })
        .filter(function (i, el) {
          return $(this).attr('value') !== '';
        })
        .map(function (i, el) {
          return {
            id: $(this).attr('value'),
            name: $(this).text(),
          };
        })
        .get();

      const parameters = $('#contaminante option')
        .filter(function (i, el) {
          return $(this).attr('value') !== '';
        })
        .filter(function (i, el) {
          return (
            acceptableParameters.indexOf(
              $(this).text().toLowerCase()
            ) !== -1
          );
        })
        .map(function (i, el) {
          return {
            id: $(this).attr('value'),
            name: $(this).text(),
          };
        })
        .get();

      const today = DateTime.now().setZone(timezone).startOf('day');
      stations.forEach((station) => {
        parameters.forEach((parameter) => {
          const url = makeStationQuery(
            source.url,
            station,
            parameter,
            today
          );
          tasks.push(
            handleStation(url, station.name, parameter.name, today)
          );
        });
      });

      parallel(tasks, (err, results) => {
        if (err) {
          return callback(err, []);
        }

        results = flattenDeep(results);
        results = convertUnits(results);
        return callback(null, {
          name: 'unused',
          measurements: results,
        });
      });
    })
    .catch((error) => {
      return callback(
        { message: 'Failed to load entry point url' },
        null
      );
    });
}

const makeStationQuery = (sourceUrl, station, parameter, date) => {
  const url = `${sourceUrl}contaminante=${parameter.id}&estacion=${
    station.id
  }&fecha_dia=${date.toFormat('d')}&fecha_mes=${date.toFormat(
    'M'
  )}&fecha_anio=${date.toFormat('y')}&menu_id=34234&buscar=Buscar`;
  return url;
};

const handleStation = (url, station, parameter, today) => {
  return (done) => {
    client({ url, responseType: 'text'})
      .then((body) => {
        const results = formatData(body, station, parameter, today);
        return done(null, results);
      })
      .catch((error) => {
        return done(null, []);
      });
  };
};

const formatData = (body, station, parameter, today) => {
  const $ = load(body);
  let measurements = [];

  const averagingPeriod = getAveragingPeriod(parameter);
  const unit = getUnit(parameter);
  const coordinates = getCoordinates(station);
  parameter = parameter.toLowerCase();

  $('#grafico table td[valign=bottom] img').each(function (i, el) {
    const title = $(this).attr('title');
    const match = title.match(/([\d.]*) - ([\d]*) hs/);
    const value = parseFloat(match[1]);
    const hours = parseFloat(match[2]);
    const date = getDate(today, hours);

    let m = {
      location: station,
      value: value,
      unit: unit,
      parameter: parameter,
      averagingPeriod: averagingPeriod,
      date: date,
      coordinates: coordinates,
      attribution: [
        {
          name: 'Buenos Aires Ciudad, Agencia de Protección Ambiental',
          url: 'http://www.buenosaires.gob.ar/agenciaambiental/monitoreoambiental',
        },
      ],
    };
    measurements.push(m);
  });
  return measurements;
};

const getDate = (today, hours) => {
  let date = DateTime.fromISO(today, { zone: timezone });
  // If hours are from 13 to 23, the date should be set to the day before yesterday
  if (hours >= 13 && hours <= 23) {
    date = date.minus({ days: 2 });
  } else if (hours >= 0 && hours <= 12) {
    // If hours are from 00 to 12, the date should be set to yesterday
    date = date.minus({ days: 1 });
  }
  date = date.set({ hour: hours });
  return {
    utc: date.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
    local: date.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
  };
};

const getCoordinates = (station) => {
  switch (station) {
    case 'CENTENARIO':
      return {
        longitude: -58.43194,
        latitude: -34.60638,
      };
    case 'CORDOBA':
      return {
        longitude: -58.39165,
        latitude: -34.60441667,
      };
    case 'LA BOCA':
      return {
        longitude: -58.36555,
        latitude: -34.62527,
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
      return { unit: 'hours', value: 8 };
    case 'NO2':
      return { unit: 'hours', value: 1 };
    case 'PM10':
      return { unit: 'hours', value: 24 };
    default:
      break;
  }
};
