/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Montenegrin data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import {
  removeUnwantedParameters,
  unifyMeasurementUnits,
  unifyParameters,
} from '../lib/utils.js';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { DateTime } from 'luxon';
import async from 'async';
import { load } from 'cheerio';

// Adding in certs to get around unverified connection issue
const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });

export const name = 'montenegro';

export async function fetchData (source, cb) {
  let tasks = [];

  for (let i = 1; i < 20; i++) {
    try {
      await new Promise((resolve, reject) => {
        request(source.url + i, (error, response, body) => {
          if (error) {
            console.error('Request error:', error);
            reject(new Error(error));
          }
          if (response.statusCode !== 200) {
            reject(
              new Error(
                'Invalid status code <' + response.statusCode + '>'
              )
            );
          }
          resolve(body);
        });
      });
      let task = function (cb) {
        request(source.url + i, function (err, res, body) {
          if (err || res.statusCode !== 200) {
            console.error('Error in task:', err || res);
            return cb(err || res);
          }
          cb(null, body);
        });
      };
      tasks.push(task);
    } catch (e) {
      console.error('Error while creating tasks:', e.message);
      continue;
    }
  }

  async.parallel(tasks, function (err, results) {
    if (err) {
      console.error('Error in async.parallel:', err);
      return cb({ message: 'Failure to load data urls.' });
    }
    try {
      let data = formatData(results);
      if (data === undefined) {
        console.error('Failed to parse data');
        return cb({ message: 'Failure to parse data.' });
      }
      cb(null, data);
    } catch (e) {
      console.error('Unknown adapter error:', e);
      return cb({ message: 'Unknown adapter error.' });
    }
  });
}

const formatData = function (results) {
  const parseLocation = (location, template) => {
    try {
      if (location === undefined || location === null) {
        console.error('Location is undefined or null');
        return;
      }
      location = location.split('|');
      if (location.length < 2 || location[0].includes('Otvori veću kartu')) { // Add this check
        console.error('Invalid location format');
        return;
      }
      const city = location[0].split(',');
      template.city = city[0].trim();
      template.location = city.length === 1 ? city[0].trim() : city[1].trim();
      let coordinates = location[1].replace('Geolokacija:', '').split(',');
      coordinates = {
        latitude: parseFloat(coordinates[0]),
        longitude: parseFloat(coordinates[1]),
      };
      template.coordinates = coordinates;
    } catch (e) {
      console.error('Error in parseLocation:', e);
    }
  };

  const parseDate = function (date, template) {
    // Validate input
    if (typeof date !== 'string' || date.trim() === '') {
      throw new Error('Invalid date string');
    }
    try {
      // Create DateTime object with timezone using the fromFormat() method
      date = date.replace('Pregled mjerenja za', '').replace('h', '');
      date = date.trim(); // remove whitespace
      const dateLuxon = DateTime.fromFormat(date, 'dd.MM.yyyy HH:mm', {
        zone: 'Europe/Podgorica',
      });
      // Return UTC and local ISO strings
      const utc = dateLuxon.toUTC().toISO({ suppressMilliseconds: true });
      const local = dateLuxon.toISO({ suppressMilliseconds: true });
      template.date = {
        utc: utc,
        local: local,
      };
    } catch (error) {
      throw new Error('Error parsing date');
    }
  };

  const parseValueAndUnit = (value, measurement) => {
    try {
      value = value.replace(/<|>/gi, '').trim();
      let splitPos = -1;
      for (let i = 0; i < value.length; i++) {
        if (
          value.charAt(i).toLowerCase() !==
          value.charAt(i).toUpperCase()
        ) {
          splitPos = i;
          break;
        }
      }
      measurement.unit = value.substring(splitPos);
      measurement.value = parseFloat(
        value.substring(0, splitPos).replace(',', '.').trim()
      );
    } catch (e) {
      console.error('Error in parseValueAndUnit:', e);
    }
  };

  let measurements = [];

  results.forEach((p) => {
    const $ = load(p);

    let template = {
      date: {},
      attribution: [{ name: 'epa.me', url: 'https://epa.org.me/' }],
      averagingPeriod: { unit: 'hours', value: 1 },
    };

    $('.col-6.col-12-medium').each((i, e) => {
      $('h6 a', e).each((i, e) => {
        const text = $(e).text();
        // console.log('Text:', text); // Add this line for additional logging
        if (text.search('|') !== -1 && text.charAt(0) !== '*') {
          parseLocation(text, template);
        }
      });
      $('h4', e).each((i, e) => {
        if ($(e).text().search('Pregled mjerenja za') !== -1) {
          parseDate($(e).text(), template);
        }
      });
    });

    let parameterIndex = -1;
    let valueIndex = -1;

    $('.sortable thead th').each((i, e) => {
      if ($(e).text().search('Oznaka') !== -1) {
        parameterIndex = i;
      }
      if ($(e).text().search('Koncentracija') !== -1) {
        valueIndex = i;
      }
    });

    $('.sortable tbody tr').each((i, e) => {
      if (parameterIndex !== -1 && valueIndex !== -1) {
        let m = Object.assign(
          { parameter: $($('td', e).get(parameterIndex)).text() },
          template
        );
        const value = $($('td', e).get(valueIndex)).text();
        parseValueAndUnit(value, m);
        m = unifyMeasurementUnits(m);
        m = unifyParameters(m);
        measurements.push(m);
      }
    });
  });

  measurements = removeUnwantedParameters(measurements);
  return {
    name: 'unused',
    measurements: measurements,
  };
};
