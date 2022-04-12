'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { cloneDeep } from 'lodash';
import { acceptableParameters } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'fhmzbih';

export function fetchData (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
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
        return {
          latitude: 43.866,
          longitude: 18.423
        };
      case 'Vijećnica':
        return {
          latitude: 43.859,
          longitude: 18.435
        };
      case 'mobilna (Ilidža)':
        return {
          latitude: 43.830,
          longitude: 18.311
        };
      case 'Ivan Sedlo':
        return {
          latitude: 43.715,
          longitude: 18.036
        };
      case 'Harmani':
        return {
          latitude: 44.343,
          longitude: 17.268
        };
      case 'Centar':
        return {
          latitude: 44.199,
          longitude: 17.913
        };
      case 'Radakovo':
        return {
          latitude: 44.195,
          longitude: 17.932
        };
      case 'Tetovo':
        return {
          latitude: 44.290,
          longitude: 17.895
        };
      case 'Brist':
        return {
          latitude: 44.202,
          longitude: 17.800
        };
      case 'Otoka':
        return {
          latitude: 43.848,
          longitude: 18.364
        };
      case 'Rasadnik':
        return {
          latitude: 43.661,
          longitude: 18.977
        };
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
