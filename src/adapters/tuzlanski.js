'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import cheerio from 'cheerio';
import Coordinates from 'coordinate-parser';
import { default as moment } from 'moment-timezone';
import { flattenDeep } from 'lodash';
import { parallel } from 'async';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'tuzlanski';

export function fetchData (source, cb) {
  // Load initial page to get active stations
  request(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    const $ = cheerio.load(body);
    let tasks = [];
    const stations = getActiveStations($, source.url);

    stations.forEach((e, i) => {
      tasks.push(handleStation(e));
    });

    parallel(tasks, (err, results) => {
      // Turn into a single array
      results = flattenDeep(results);

      // Be kind, convert
      results = convertUnits(results);

      return cb(err, {name: 'unused', measurements: results});
    });
  });
}

const handleStation = function (stationUrl) {
  return function (done) {
    request(stationUrl, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done({message: 'Failure to load station url.'});
      }
      formatData(body, (measurements) => {
        return done(null, measurements);
      });
    });
  };
};

const formatData = function (results, cb) {
  const $ = cheerio.load(results);
  if ($('h2').text().indexOf('Mobilna') !== -1 &&
      $('.data-legend').last().text().indexOf('Adresa') === -1) {
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
    averagingPeriod: {unit: 'hours', value: 1},
    attribution: [{
      name: 'Tuzlanski Kanton',
      url: 'http://monitoringzrakatk.info'
    }]
  };

  let legends = $('.data-legend').last().find('div div');
  base.city = legends.eq(1).text().split(' ').reverse()[0];

  let position;
  try {
    position = new Coordinates(legends.eq(3).text().split(':')[1] + ' ' +
                                 legends.eq(4).text().split(':')[1]);
  } catch (error) {
    // Catch error due to bad data in coords place
    return cb([]);
  }

  if (position.getLatitude() && position.getLongitude()) {
    base.coordinates = {
      latitude: position.getLatitude(),
      longitude: position.getLongitude()
    };
  }

  let measurements = [];
  $('.data-values').find('.row').eq(1).find('.row').first().children().each((i, e) => {
    let m = Object.assign({}, base);
    if (i % 2 === 0) {
      m.parameter = renameParameter($(e).text().split('*')[0]);
      m.value = Number($(e).next().text().split(' ')[0].replace(',', '.'));
      m.unit = $(e).next().text().split(' ')[1];
      if (m.value) {
        measurements.push(m);
      }
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
  const date = moment.tz(s, 'DD/MM/YYYY HH:mm', 'Europe/Sarajevo');

  return {utc: date.toDate(), local: date.format()};
};

const getActiveStations = function ($, baseUrl) {
  let stations = new Set();
  let elements = $('.btn-station-ico--active').parent('a');
  elements.map(function (i, e) {
    stations.add(baseUrl + $(e).attr('href'));
  });
  return Array.from(stations);
};

const renameParameter = function (parameter) {
  switch (parameter) {
    case 'NO₂':
      return 'no2';
    case 'SO₂':
      return 'so2';
    case 'CO':
      return 'co';
    case 'Suspendovane čestice PM2.5':
      return 'pm25';
    case 'O₃':
      return 'o3';
    default:
      return parameter;
  }
};
