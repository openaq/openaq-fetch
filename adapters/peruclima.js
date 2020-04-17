'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { parallel } from 'async';
import cheerio from 'cheerio';
import { isFinite } from 'lodash';
import { convertUnits, toTitleCase } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'peruclima';

export function fetchData (source, cb) {
  // This is the list of individual station ids
  const stations = ['112194', '112192', '112193', '112208', '112233', '112267',
    '112266', '111286', '112265', '111287'];

  let tasks = [];
  stations.forEach((s) => {
    const task = (cb) => {
      const url = `${source.url}?p=0412&txt=${s}`;
      request(url, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        return cb(null, body);
      });
    };

    tasks.push(task);
  });

  parallel(tasks, (err, results) => {
    if (err) {
      return cb({message: 'Failure to load data urls.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(results);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
}

const formatData = function (results) {
  let measurements = [];

  const getCoordinates = function (loc) {
    switch (loc) {
      case 'CAMPO DE MARTE':
        return {'latitude': -12.0705278, 'longitude': -77.0431667};
      case 'VILLA MARIA DEL TRIUNFO':
        return {'latitude': -12.1663889, 'longitude': -76.92};
      case 'SAN BORJA':
        return {'latitude': -12.1086278, 'longitude': -77.0077667};
      case 'SANTA ANITA':
        return {'latitude': -12.043, 'longitude': -76.9714167};
      case 'ATE':
        return {'latitude': -12.0261111, 'longitude': -76.9186111};
      case 'SAN MARTIN DE PORRES':
        return {'latitude': -12.0088889, 'longitude': -77.0844722};
      case 'CARABAYLLO':
        return {'latitude': -11.9021944, 'longitude': -77.0336389};
      case 'PUENTE PIEDRA':
        return {'latitude': -11.8632528, 'longitude': -77.0741333};
      case 'HUACHIPA':
        return {'latitude': -12.01689, 'longitude': -76.94883};
      case 'SAN JUAN DE LURIGANCHO':
        return {'latitude': -12.01689, 'longitude': -76.99883};
      default:
        return undefined;
    }
  };

  // This will loop over each individual station page we've received
  results.forEach((r) => {
    // Load the html into Cheerio
    const $ = cheerio.load(r);

    const base = {
      city: 'Lima',
      attribution: [{'name': 'Peru Ministerio de Ambiente', 'url': 'http://www.senamhi.gob.pe/'}],
      averagingPeriod: {'value': 1, 'unit': 'hours'}
    };

    // Use first table to grab all the info
    let location;
    let baseDate;
    let parameters = [];
    $('tr', $('tbody').get(0)).each((i, e) => {
      if (i === 0) {
        // Get location
        location = $('td', $(e)).html().split('<br>')[1].trim();
      } else if (i === 1) {
        // Get the base date
        const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
        const match = dateRegex.exec($(e).text());
        baseDate = match[1];
      } else if (i === 2) {
        // Grab all parameters
        $('td', $(e)).each((i, e) => {
          let p = {
            parameter: $(e).text().split('(')[0].trim().toLowerCase()
          };

          // If it's PM2.5, make it pm25
          p.parameter = (p.parameter === 'pm2.5') ? 'pm25' : p.parameter;

          // If it's not Horas, add a unit
          if (p.name !== 'horas') {
            p.unit = ($(e).text().substring($(e).text().indexOf('(') + 1, $(e).text().indexOf(')'))).trim();
          }

          // And make it all official
          p.unit = (p.unit === 'µg/m3') ? 'µg/m³' : p.unit;

          parameters.push(p);
        });
      } else {
        // Loop over each row in table which is a unique time
        let date;
        $('td', $(e)).each((i, e) => {
          if (i === 0) {
            // Get the time for these measurements
            const dateMoment = moment.tz(`${baseDate} ${$(e).text()}`, 'DD/MM/YYYY HH:mm', 'America/Lima');
            date = {utc: dateMoment.toDate(), local: dateMoment.format()};
          } else {
            // Create a unique measurement
            let m = Object.assign({}, base);
            m.date = date;
            m.location = toTitleCase(location);
            m.coordinates = getCoordinates(location);

            // Exit if not a desired parameter
            if (['pm25', 'pm10', 'so2', 'no2', 'co', 'o3', 'bc'].indexOf(parameters[i].parameter) === -1) {
              return;
            }
            m = Object.assign(m, parameters[i]);

            // Make sure value is valid
            const value = Number($(e).text());
            if (!isFinite(value)) {
              return;
            }
            m.value = value;

            // Add it!
            measurements.push(m);
          }
        });
      }
    });
  });

  // Be kind, convert units
  measurements = convertUnits(measurements);

  return {name: 'unused', measurements: measurements};
};
