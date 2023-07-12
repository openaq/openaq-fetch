'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import {
  convertUnits,
  unifyMeasurementUnits,
} from '../lib/utils.js';
import { load } from 'cheerio';
import Coordinates from 'coordinate-parser';
import { DateTime } from 'luxon';
import flattenDeep from 'lodash/flattenDeep.js';
import { parallel } from 'async';
import log from '../lib/logger.js';
import got from 'got';

export const name = 'tuzlanski';

export function fetchData(source, cb) {
  // Load initial page to get active stations
  got(source.url, { timeout: { request: REQUEST_TIMEOUT } })
    .then(response => {
      const body = response.body;
      const $ = load(body);
      let tasks = [];
      const stations = getActiveStations($, source.url);

      log.info(`Found ${stations.length} stations`);

      stations.forEach((e, i) => {
        tasks.push(handleStation(e));
      });

      parallel(tasks, (err, results) => {
        // Turn into a single array
        results = flattenDeep(results);

        // Be kind, convert
        results = convertUnits(results);

        return cb(err, { name: 'unused', measurements: results });
      });
    })
    .catch(err => {
      return cb(err, { message: 'Failure to load data url.' });
    });
}

const handleStation = function (stationUrl) {
  return function (done) {
    log.debug(`Fetching data for ${stationUrl}`);
    got(stationUrl, { timeout: { request: REQUEST_TIMEOUT } })
      .then(response => {
        const body = response.body;
        formatData(body, (measurements) => {
          return done(null, measurements);
        });
      })
      .catch(err => {
        return done(err, { message: 'Failure to load station url.' });
      });
  };
};

const formatData = function (results, cb) {
  const $ = load(results);
  if (
    $('h2').text().indexOf('Mobilna') !== -1 &&
    $('.data-legend').last().text().indexOf('Adresa') === -1
  ) {
    // skip mobile stations
    return cb([]);
  }

  // Catch case where time is not properly parsed
  const time = getTime($($('.data-values .row')[0]).text());
  if (!time) {
    return cb([]);
  }
  let base = {
    location: $('h2').text().split(' ').slice(2).join(' '),
    date: time,
    averagingPeriod: { unit: 'hours', value: 1 },
    attribution: [
      {
        name: 'Tuzlanski Kanton',
        url: 'http://monitoringzrakatk.info',
      },
    ],
  };

  let legends = $('.data-legend').last().find('div div');
  base.city = legends.eq(1).text().split(' ').reverse()[0];

  let position;
  try {
    position = new Coordinates(
      legends.eq(3).text().split(':')[1] +
        ' ' +
        legends.eq(4).text().split(':')[1]
    );
  } catch (error) {
    // Catch error due to bad data in coords place
    return cb(error, []);
  }

  if (position.getLatitude() && position.getLongitude()) {
    base.coordinates = {
      latitude: position.getLatitude(),
      longitude: position.getLongitude(),
    };
  }

  let measurements = [];
  let m = Object.assign({}, base);

  let state = 0; // 0: reading parameter, 1: reading unit, 2: reading value

  $('.data-values')
    .find('.row')
    .eq(1)
    .find('.row')
    .first()
    .children()
    .each((i, e) => {
      let currentText = $(e).text().trim().replace(/\s+/g, ' ');
      let regExp = /\(([^)]+)\)/;
      let valueExp = /(\d+\.?\d*)/; // to extract the value
      let unitMatch = regExp.exec(currentText);
      let valueMatch = valueExp.exec(currentText);

      // Extract parameter
      let parameterExp = /(.*?)(?=\()/;
      let parameterMatch = parameterExp.exec(currentText);
      // Special case for "Suspendovane čestice PM2.5"
      if (currentText.startsWith('Suspendovane čestice PM2.5')) {
        m.parameter = 'pm25';
        if (unitMatch) {
          m.unit = unitMatch[1];
        }
        let pm25ValueExp = /\*\*\*(\d+\.?\d*)/; // to extract the value after ***
        let pm25ValueMatch = pm25ValueExp.exec(currentText);
        if (pm25ValueMatch) {
          m.value = parseFloat(pm25ValueMatch[1].replace(',', '.'));
        }
        unifyMeasurementUnits(m);
        measurements.push(m);
        m = Object.assign({}, base); // Reset m for the next measurement
        state = 0; // Set state back to 0
        return; // Skip rest of this iteration and move to next child
      }
      switch (state) {
        case 0: // reading parameter
          if (parameterMatch) {
            m.parameter = renameParameter(parameterMatch[1].trim());
            state = 1;
          }
          break;

        case 1: // reading unit
          if (unitMatch) {
            m.unit = unitMatch[1];
            state = 2;
          } else {
            state = 0;
          }
          break;

        case 2: // reading value
          if (valueMatch) {
            m.value = parseFloat(valueMatch[0].replace(',', '.'));
            unifyMeasurementUnits(m);
            measurements.push(m);
            m = Object.assign({}, base); // Reset m for the next measurement
            state = 0;
          } else if (unitMatch) {
            m.parameter = renameParameter(
              currentText.split('*')[0].split(' ')[0]
            );
            state = 1;
          } else {
            state = 0;
          }
          break;
      }
      // If parameter, unit, and value are in the same line
      if (unitMatch && valueMatch) {
        m.parameter = renameParameter(
          currentText.split('*')[0].split(' ')[0]
        );
        m.unit = unitMatch[1];
        m.value = parseFloat(valueMatch[0].replace(',', '.'));
        unifyMeasurementUnits(m);
        measurements.push(m);
        m = Object.assign({}, base); // Reset m for the next measurement
        state = 0;
      }
    });
  return cb(measurements);
};

const getTime = function (text) {
  let s = /(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2})/.exec(text);
  if (!s) {
    return undefined;
  }

  s = s[0];
  const date = DateTime.fromFormat(s.trim(), 'dd.LL.yyyy HH:mm', { zone: 'Europe/Sarajevo' });
  return { utc: date.toUTC().toISO({ suppressMilliseconds: true }), local: date.toISO({ suppressMilliseconds: true }) };
};

const getActiveStations = function ($, baseUrl) {
  let stations = new Set();
  let elements = $('.btn-station-ico--active').parent('a');
  log.debug(`Getting stations from ${baseUrl}`);
  elements.map(function (i, e) {
    stations.add(baseUrl + $(e).attr('href'));
  });
  return Array.from(stations);
};

function renameParameter(parameter) {
  const paramMappings = {
    'SO₂': 'so2',
    'NO₂': 'no2',
    CO: 'co',
    'O₃': 'o3',
    'Suspendovane čestice PM2.5': 'pm25',
    // Add more mappings if needed
  };

  return paramMappings[parameter] || parameter;
}
