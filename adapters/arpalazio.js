'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { parallel } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';
import { default as parse } from 'csv-parse/lib/sync';
import { zip, flattenDeep } from 'lodash';

exports.name = 'arpalazio';

const baseUrl = 'http://www.arpalazio.net/main/aria/sci/annoincorso/';
const provinceQueryPath = 'chimici/chimici.php';

exports.fetchData = function (source, cb) {
  let datiOrari = 0;
  request(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      cb(err || res);
    }

    const $ = cheerio.load(body);
    let provinces = $('#provincia option')
        .filter(function (i, el) {
          return Number($(this).attr('value')) >= 0;
        })
        .map(function (i, el) {
          return { id: $(this).attr('value'), name: $(this).text() };
        }).get();

    let tasks = [];
    provinces.forEach(function (province) {
      const provinceURL = `${baseUrl}${provinceQueryPath}?provincia=${province.id}&dati=${datiOrari}`;
      tasks.push(handleProvince(provinceURL, province.name, source));
    });

    parallel(tasks, (err, results) => {
      if (err) {
        return cb(err, []);
      }
      results = flattenDeep(results);
      results = convertUnits(results);

      return cb(err, {name: 'unused', measurements: results});
    });
  });
};

const handleProvince = function (url, name, source) {
  return function (done) {
    request(url, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      // get pollutant.txt links
      const $ = cheerio.load(body);
      let pollutantURLs = $('a').map(function (i, el) {
        const pollutant = $(this).text().toLowerCase().replace('.', '');
        if (acceptableParameters.indexOf(pollutant) >= 0) {
          const href = $(this).attr('href');
          return `${baseUrl}${href}`;
        }
      }).get();

      let tasks = [];
      console.log(pollutantURLs.length);
      pollutantURLs.forEach((url) => tasks.push(getData(url, name, source)));
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

const getData = function (url, city, source) {
  return function (done) {
    const match = url.match(/[\w]{2}_([\w\.]{2,})_([\d]{4}).txt/);
    const parameter = match[1].toLowerCase().replace('.', '');
    const year = match[2];

    request(url, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        console.log(url);
        return done(null, []);
      }
      // remove whitespace for clean parsing
      body = body.replace(/[ ]+/g, ' ');
      body = body.replace(/^[ ]/g, '');
      body = body.replace(/\n[ ]+/g, '\n');

      const parsed = parse(body, {delimiter: ' '});
      const headers = parsed.slice(0, 1)[0];
      const records = parsed.slice(1);

      // zip them to check -999 values
      let zipped = zip(...records);
      let invalidStationIDs = [];
      zipped.forEach(function (values, i, _) {
        if (values.every((v) => Number(v) === -999)) {
          invalidStationIDs.push(headers[i]);
        }
      });

      let measurements = [];
      records.forEach(function (row) {
        const date = moment.tz(`${year} ${row[0]} ${row[1]}`, 'YYYY DDD HH', 'Europe/Rome');
        const fullDate = {
          utc: date.toDate(),
          local: date.format()
        };
        const rowValuesOffset = 2; // skip the date parts

        let base = {
          date: fullDate,
          city: city,
          averagingPeriod: {unit: 'hours', value: 1},
          attribution: [{
            name: source.name,
            url: source.sourceURL
          }]
        };

        row.slice(rowValuesOffset).forEach(function (value, i, _) {
          if (invalidStationIDs.indexOf(headers[i + rowValuesOffset]) >= 0) {
            return;
          }
          const location = 'Location ' + headers[i + rowValuesOffset]; // FIXME

          let m = Object.assign({}, base);
          m.location = location;
          m.value = Number(value);
          m.parameter = parameter;
          m.unit = 'ppm'; // FIXME
          // m.coordinates = {}; //FIXME

          measurements.push(m);
        });
      });
      done(null, measurements);
    });
  };
};
