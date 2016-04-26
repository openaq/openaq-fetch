'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import log from '../lib/logger';
import { cloneDeep } from 'lodash';
import { acceptableParameters } from '../lib/utils';

export const name = 'fhmzbih';

export function fetchData (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      log.error(err || res.statusCode);
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
}

var formatData = function (data) {
  const getDate = function (dateString) {
    const date = moment.tz(dateString, 'YYYY-MM-DD HH:mm:ss', 'Europe/Sarajevo');

    return {utc: date.toDate(), local: date.format()};
  };

  const getNiceParameters = function (parameter) {
    return parameter.toLowerCase();
  };

  const getCoordinates = function (location, parameter) {
    switch (location) {
      case 'Bjelave':
        let coords = {
          latitude: 43.917,
          longitude: 18.8
        };
        if (parameter === 'pm10') {
          coords = {
            latitude: 43.933,
            longitude: 18.783
          };
        }
        return coords;
      case 'Vijećnica':
        return {
          latitude: 44.73,
          longitude: 19.166
        };
      case 'mobilna (Ilidža)':
        return {
          latitude: 44.483,
          longitude: 19.116
        };
      case 'Ivan Sedlo':
        return {
          latitude: 43.816,
          longitude: 18.2
        };
      case 'Harmani':
        return {
          latitude: 44.916,
          longitude: 17.349
        };
      case 'Centar':
        return {
          latitude: 45.13,
          longitude: 18.7
        };
      case 'Radakovo':
        return {
          latitude: 44.9,
          longitude: 18.83
        };
      case 'Tetovo':
        return {
          latitude: 44.75,
          longitude: 18.349
        };
      case 'Brist':
        return {
          latitude: 44.3,
          longitude: 17.93
        };
      default:
        return;
    }
  };

  // Load all the XML
  const $ = cheerio.load(data);

  // Grab the table we want
  const table = $('.aktuelnoTekst1 table');

  // Set the base object
  const baseObj = {
    location: '',
    unit: 'µg/m³',
    averagingPeriod: {'value': 1, 'unit': 'hours'},
    attribution: [{
      name: 'Federalni hidrometeorološki zavod',
      url: 'http://www.fhmzbih.gov.ba/latinica/AKTUELNI/A-zrak.php'
    }]
  };

  // Grab each row and loop over for measurements and parameters, cut off the
  // last row since it's unwanted details (better way to do this?)
  let date;
  let columns = [];
  let measurements = [];
  let lastCity;
  $('tr', table).each((i, e) => {
    if (i === 0) {
      // Get date
      const text = $('td', e).text();
      const regex = /(\d{4}-\d{2}-\d{2}) \w? (\d{2}:\d{2}:\d{2})/;
      const match = regex.exec(text);
      date = getDate(`${match[1]} ${match[2]}`);
    } else if (i === 1) {
      // Get parameters
      $('td', e).each((i, e) => {
        columns.push($(e).text());
      });
    } else {
      // Get measurements
      // First thing is to find the city, to do this we check if there are 8
      // or 8 cols and then set city to first col if there are 9
      const colCount = $(e).find('td').length;
      let idxStart = 0;
      if (colCount === 9) {
        lastCity = $($('td', e).get(0)).text();
        idxStart = 1;
      }

      let location;
      $('td', e).each((i, e) => {
        if (i === idxStart) {
          location = $(e).text();
        } else if (i > idxStart) {
          let measurement = cloneDeep(baseObj);

          // Don't save if it's not a parameter we want, some weird logic here
          // in indexing to account for different row sizes.
          measurement.parameter = getNiceParameters(columns[i + (1 - idxStart)]);
          if (acceptableParameters.indexOf(measurement.parameter) === -1) {
            return;
          }

          // Make sure value is good
          if (isNaN($(e).text())) {
            return;
          }

          // To prevent details at bottom of page getting caught, check to make
          // city is something reasonable based on length (better way to do this?)
          if (lastCity.length > 100) {
            return;
          }

          measurement.city = lastCity;
          measurement.location = location;
          measurement.value = Number($(e).text());
          measurement.date = date;
          measurement.coordinates = getCoordinates(location, measurement.parameter);
          measurements.push(measurement);
        }
      });
    }
  });

  return {
    name: 'unused',
    measurements: measurements
  };
};
