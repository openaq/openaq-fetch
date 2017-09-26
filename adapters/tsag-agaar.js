'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import cheerio from 'cheerio';
import { flattenDeep, isFinite } from 'lodash';
import { parallel } from 'async';
import { default as moment } from 'moment-timezone';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'tsag-agaar';

export function fetchData (source, cb) {
  request(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'}, []);
    }
    const $ = cheerio.load(body);
    const regionTasks = $('#WeatherCity option')
      .filter((i, el) => {
        return $(el).attr('value') !== '';
      })
      .map((i, el) => {
        return followRegion(source, $(el).attr('value'));
      })
      .get();
    parallel(regionTasks, (err, results) => {
      if (err) {
        return cb(err, []);
      }

      results = flattenDeep(results);
      results = convertUnits(results);

      return cb(err, {name: 'unused', measurements: results});
    });
  });
}

const followRegion = function (source, regionID) {
  return function (done) {
    const regionURL = `${source.sourceURL}/update_stations/?type=air-data&city=${regionID}`;
    request(regionURL, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      const $ = cheerio.load(body);
      const cityTasks = $('#WeatherSum option')
        .filter((i, el) => {
          return $(el).attr('value') !== '';
        })
        .map((i, el) => {
          return followCity(source, $(el).attr('value'), $(el).text());
        })
        .get();
      parallel(cityTasks, (err, results) => {
        if (err) {
          return done(err, []);
        }
        return done(null, results);
      });
    });
  };
};

const followCity = function (source, cityID, cityName) {
  return function (done) {
    const cityURL = `${source.sourceURL}/get_monitoring_data/?type=air-data&sum=${cityID}`;
    request(cityURL, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      formatData(source, body, cityName, (measurements) => {
        return done(null, measurements);
      });
    });
  };
};

const formatData = function (source, body, city, cb) {
  const $ = cheerio.load(body);
  let measurements = [];
  $('#table-data table').each((i, el) => {
    let parameters = {};
    const stationMeta = $(el).find('th').text();
    $(el).find('thead tr').last().find('td').each((i, el) => {
      if (i < 2) { return; }
      parameters[i] = $(el).text().trim().split(' ')[0].toLowerCase();
    });
    $(el).find('tbody tr').each((i, el) => {
      const date = $(el).find('td').first().text();
      const hours = $(el).find('td').eq(1).text();

      $(el).find('td').each((i, el) => {
        if (i < 2 || !isFinite(Number($(el).text()))) { return; }
        let m = {
          city: city,
          location: stationMeta.split(' (')[0],
          parameter: parameters[i],
          unit: 'mg/m³', // FIXME
          value: Number($(el).text()),
          date: getDate(date, hours, source.timezone),
          description: stationMeta,
          attribution: [
            {
              name: source.name,
              url: source.sourceURL
            },
            {
              name: 'National Agency of Meteorology and Environmental Monitoring',
              url: 'http://namem.gov.mn'
            }
          ],
          averagingPeriod: {
            value: 0.3,
            unit: 'hours'
          }
        };
        measurements.push(m);
      });
    });
  });
  return cb(measurements);
};

const getDate = function (dateText, hours, timezone) {
  const date = moment.tz(`${dateText} ${hours}`, 'YYYY.MM.DD HH', timezone);
  return {
    utc: date.toDate(),
    local: date.format()
  };
};
