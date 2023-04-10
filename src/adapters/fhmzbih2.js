// Based on previos fhmzbih adapter, updated for new page layout
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { cloneDeep } from 'lodash';
import { acceptableParameters } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'fhmzbih2';

export function fetchData (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body, source);

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

var formatData = function (data, source) {
  const getDate = function (dateString) {
    const date = moment.tz(dateString, 'YYYY-MM-DD HH:mm:ss', 'Europe/Sarajevo');

    return {utc: date.toDate(), local: date.format()};
  };

  const getNiceParameters = function (parameter) {
    return parameter.toLowerCase();
  };

  const getCoordinates = function (city, location, parameter) {
    switch (`${city} - ${location}`) {
      case 'Sarajevo - Bjelave':
        return {
          latitude: 43.866,
          longitude: 18.423
        };
      case 'Sarajevo - Vijećnica':
        return {
          latitude: 43.859,
          longitude: 18.435
        };
      case 'Sarajevo - IvanSedlo':
        return {
          latitude: 43.715,
          longitude: 18.036
        };
      case 'Jajce - Harmani':
        return {
          latitude: 44.343,
          longitude: 17.268
        };
      case 'Zenica - Radakovo':
        return {
          latitude: 44.195,
          longitude: 17.932
        };
      case 'Zenica - Centar':
        return {
          latitude: 44.199,
          longitude: 17.913
        };
      case 'Zenica - Tetovo':
        return {
          latitude: 44.290,
          longitude: 17.895
        };
      case 'Zenica - Brist':
        return {
          latitude: 44.202,
          longitude: 17.800
        };
      case 'Sarajevo - Otoka':
        return {
          latitude: 43.848,
          longitude: 18.364
        };
      case 'Goražde - Rasadnik':
        return {
          latitude: 43.661,
          longitude: 18.977
        };
      case 'Sarajevo - Ilidža':
        return {
          latitude: 43.83,
          longitude: 18.311
        }; // from https://github.com/openaq/openaq-fetch/issues/504
      case 'Ilijaš - Ilijaš':
        return {
          latitude: 43.96,
          longitude: 18.26
        }; // from https://github.com/openaq/openaq-fetch/issues/504
      case 'Kakanj - Doboj':
        return {
          latitude: 44.116,
          longitude: 18.113
        }; // from https://github.com/openaq/openaq-fetch/issues/504
    }
  };

  // Load page
  const $ = cheerio.load(data);

  // Grab the table we want
  const table = $('table').first();

  // Set the base object
  const baseObj = {
    location: '',
    unit: 'µg/m³',
    averagingPeriod: {'value': 1, 'unit': 'hours'},
    attribution: [{
      name: 'Federalni hidrometeorološki zavod',
      url: source.sourceURL
    }]
  };

  // Grab each row and loop over for measurements and parameters, cut off the
  // last row since it's unwanted details (better way to do this?)
  let date;
  let columns = [];
  let measurements = [];
  let lastCity;
  $(table).children('tr').each((i, e) => {
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
      // First thing is to find the city, to do this we check if there are
      // all cols present or not and then set city to first col if they are
      // all present

      // Catch the last footer tr so it doesn't break things
      if ($('td', e).first().attr('colspan') === '10') {
        return;
      }

      const colCount = $(e).find('td').length;
      let idxStart = 0;
      if (colCount === (columns.length + 1) || colCount === columns.length) {
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
          measurement.parameter = getNiceParameters(columns[(i - idxStart)]);
          if (!acceptableParameters.includes(measurement.parameter)) {
            return;
          }

          // Make sure value is good
          if (isNaN($(e).text()) || $(e).text().trim() === '') {
            return;
          }

          // To prevent details at bottom of page getting caught, check to make
          // city is something reasonable based on length (better way to do this?)
          if (lastCity.length > 100) {
            return;
          }

          // Try to make the city name look a bit nicer
          lastCity = lastCity
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          measurement.city = lastCity;
          measurement.location = location;
          measurement.value = Number($(e).text());
          measurement.date = date;
          measurement.coordinates = getCoordinates(lastCity, location, measurement.parameter);
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
