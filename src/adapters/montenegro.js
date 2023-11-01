/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Montenegrin data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */

'use strict';

import { DateTime } from 'luxon';
import { load } from 'cheerio';
import client from '../lib/requests.js';
import log from '../lib/logger.js';
import {
  removeUnwantedParameters,
  unifyMeasurementUnits,
  unifyParameters,
} from '../lib/utils.js';

export const name = 'montenegro';

export async function fetchData(source, cb) {
  let tasks = [];

  for (let i = 1; i < 20; i++) {
    let task = async function () {
      try {
        const response = await client(source.url + i);
        return response.body;
      } catch (error) {
        log.debug(`Error fetching data from URL: ${source.url + i}. Giving up after retries.`, error.message);
        return null;
      }
    };
    tasks.push(task);
  }

  try {
    const results = await Promise.all(tasks.map((task) => task()));
    const filteredResults = results.filter(result => result);
    const data = formatData(filteredResults);
    if (data === undefined) {
      log.debug('Failed to parse data');
      return cb({ message: 'Failure to parse data.' });
    }
    cb(null, data);
  } catch (error) {
    log.debug('Error in async.parallel:', error.message);
    return cb({ message: 'Failure to load data urls.' });
  }
}

const formatData = function (results) {
  const parseLocation = (location, template) => {
    try {
      if (location === undefined || location === null) {
        log.debug('Location is undefined or null');
        return;
      }
      location = location.split('|');
      if (
        location.length < 2 ||
        location[0].includes('Otvori veću kartu')
      ) {
        log.debug('Invalid location format');
        return;
      }
      const city = location[0].split(',');
      template.city = city[0].trim();
      template.location =
        city.length === 1 ? city[0].trim() : city[1].trim();
      let coordinates = location[1]
        .replace('Geolokacija:', '')
        .split(',');
      coordinates = {
        latitude: parseFloat(coordinates[0]),
        longitude: parseFloat(coordinates[1]),
      };
      template.coordinates = coordinates;
    } catch (e) {
      log.debug('Error in parseLocation:', e);
    }
  };

  const parseDate = function (date, template) {
    if (typeof date !== 'string' || date.trim() === '') {
      throw new Error('Invalid date string');
    }
    try {
      date = date.replace('Pregled mjerenja za', '').replace('h', '');
      date = date.trim();
      const dateLuxon = DateTime.fromFormat(
        date,
        'dd.MM.yyyy HH:mm',
        {
          zone: 'Europe/Podgorica',
        }
      );
      const utc = dateLuxon
        .toUTC()
        .toISO({ suppressMilliseconds: true });
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
      log.debug('Error in parseValueAndUnit:', e);
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
        // log.debug('Text:', text);
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
