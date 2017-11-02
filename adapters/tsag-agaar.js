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

// agaar.mn provides data for these
// so skip them to avoid unneeded duplicates
export const skippableLocations = ['УБ-2', 'УБ-8'];

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
    let units = {};
    const stationMeta = $(el).find('th').text();
    $(el).find('thead tr').last().find('td').each((i, el) => {
      if (i < 2) { return; }
      parameters[i] = $(el).text().trim().split(' ')[0].toLowerCase();
      units[i] = $(el).text().trim().match(/.* \((.*\/.*)\)/)[1];
    });
    $(el).find('tbody tr').each((i, el) => {
      const date = $(el).find('td').first().text();
      const hours = $(el).find('td').eq(1).text();

      $(el).find('td').each((i, el) => {
        if (i < 2 || !isFinite(Number($(el).text()))) { return; }
        const location = stationMeta.split(' (')[0];
        if (skippableLocations.indexOf(location) > -1) {
          return;
        }

        if (location.match(/УБ-[0-9]{1,2}/)) {
          city = 'Ulaanbaatar';
        }
        if (units[i] === 'мг/м3') {
          units[i] = 'mg/m³';
        }

        let m = {
          city: city,
          location: location,
          parameter: parameters[i],
          unit: units[i],
          value: Number($(el).text()),
          coordinates: coordinates[location],
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

const coordinates = {
  'УБ-1': { latitude: 47.89401111111111, longitude: 106.88265 },
  'УБ-2': { latitude: 47.91540555555555, longitude: 106.89433333333334 },
  'УБ-3': { latitude: 47.91786111111111, longitude: 106.84806111111111 },
  'УБ-4': { latitude: 47.917402777777774, longitude: 106.93749166666667 },
  'УБ-5': { latitude: 47.93290277777778, longitude: 106.92137777777778 },
  'УБ-6': { latitude: 47.91345, longitude: 106.97203055555556 },
  'УБ-7': { latitude: 47.90561666666667, longitude: 106.84249166666666 },
  'УБ-8': { latitude: 47.86595277777778, longitude: 107.11826944444444 },
  'УБ-9': { latitude: 47.98191388888889, longitude: 106.94051111111112 },
  'УБ-10': { latitude: 47.91208888888889, longitude: 106.82301944444444 },
  'УБ-11': { latitude: 47.95143055555556, longitude: 106.90407222222223 },
  'Цэцэрлэг': { latitude: 47.47219444444445, longitude: 101.46244444444444 },
  'Өлгий': { latitude: 48.96919444444445, longitude: 89.96494444444444 },
  'Баянхонгор': { latitude: 46.197111111111106, longitude: 100.72008333333333 },
  'Булган': { latitude: 48.818222222222225, longitude: 103.51866666666666 },
  'Алтай': { latitude: 46.37652777777778, longitude: 96.26233333333333 },
  'Чойр': { latitude: 46.35777777777778, longitude: 108.24611111111112 },
  'Дархан': { latitude: 49.49038888888889, longitude: 105.90650000000001 },
  'Шарын гол': { latitude: 49.26144444444444, longitude: 106.4118888888889 },
  'Мандалговь': { latitude: 45.76711111111111, longitude: 106.27488888888888 },
  'Чойбалсан': { latitude: 48.080555555555556, longitude: 114.53758333333333 },
  'Сайншанд': { latitude: 45.06663888888889, longitude: 110.1463888888889 },
  'Баруун-Урт': { latitude: 46.680305555555556, longitude: 113.28025 },
  'Сүхбаатар': { latitude: 50.239694444444446, longitude: 106.19277777777778 },
  'Зүүнхараа': { latitude: 48.86666666666667, longitude: 106.85 },
  'Улиастай': { latitude: 47.726888888888894, longitude: 96.84738888888889 },
  'Улаангом': { latitude: 49.971944444444446, longitude: 92.0773611111111 },
  'Ховд': { latitude: 47.996, longitude: 91.63391666666668 },
  'Мөрөн': { latitude: 49.63886111111111, longitude: 100.16652777777779 },
  'Өндөрхаан': { latitude: 47.323972222222224, longitude: 110.64866666666667 },
  'Зуунмод': { latitude: 47.71038888888889, longitude: 106.95365277777778 },
  'Арвайхээр': { latitude: 46.258916666666664, longitude: 102.78922222222222 },
  'Даланзадгад': { latitude: 43.56761111111111, longitude: 104.42266666666667 },
  'Эрдэнэт1': { latitude: 49.01938888888889, longitude: 104.04527777777777 },
  'Эрдэнэт2': { latitude: 49.01705555555556, longitude: 104.02813888888889 },
  'Эрдэнэт3': { latitude: 49.01347222222222, longitude: 104.019 }
};
