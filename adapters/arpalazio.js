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
    const unit = getUnit(parameter);

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
          const stationID = headers[i + rowValuesOffset];
          if (invalidStationIDs.indexOf(stationID) >= 0) {
            return;
          }

          let m = Object.assign({}, base);
          m.value = Number(value);
          m.parameter = parameter;
          m.unit = unit;

          try {
            m.location = metaData[stationID].name;
            m.coordinates = {
              longitude: metaData[stationID].longitude,
              latitude: metaData[stationID].latitude
            };
          } catch (e) {
            //m.location = `Location-ID-${stationID}`;
          };
          measurements.push(m);
        });
      });
      done(null, measurements);
    });
  };
};

const getUnit = function (parameter) {
  // unit mapping described in
  // http://www.arpalazio.net/main/aria/sci/annoincorso/LegendaDatiChimici.pdf
  switch (parameter) {
  case 'co':
    return 'mg/m3';
  default:
    return 'μg/m3';
  }
};

// metadata generated with ../data_scripts/arpalazio.js
const metaData = {
  '2': { name: 'Preneste', latitude: 41.886018, longitude: 12.541614 },
  '3': { name: 'Francia', latitude: 41.947447, longitude: 12.469588 },
  '5': 
  { name: 'Magna Grecia',
    latitude: 41.883064,
    longitude: 12.508939 },
  '8': { name: 'Cinecitta', latitude: 41.85772, longitude: 12.568665 },
  '10': 
  { name: 'Colleferro-Oberdan',
    latitude: 41.73084,
    longitude: 13.00435 },
  '11': 
  { name: 'Colleferro-Europa',
    latitude: 41.72501,
    longitude: 13.009575 },
  '14': { name: 'Allumiere', latitude: 42.157741, longitude: 11.908744 },
  '15': 
  { name: 'Civitavecchia',
    latitude: 42.091629,
    longitude: 11.802466 },
  '16': { name: 'Guidonia', latitude: 41.995679, longitude: 12.726371 },
  '17': { name: 'Rieti 1', latitude: 42.404093, longitude: 12.858224 },
  '20': { name: 'Via Tasso', latitude: 41.464025, longitude: 12.913039 },
  '23': { name: 'Aprilia 2', latitude: 41.595344, longitude: 12.653581 },
  '27': { name: 'Ceccano', latitude: 41.57, longitude: 13.33719 },
  '28': { name: 'Ferentino', latitude: 41.69, longitude: 13.250411 },
  '29': { name: 'Anagni', latitude: 41.75, longitude: 13.149685 },
  '32': { name: 'Viterbo', latitude: 42.422058, longitude: 12.109125 },
  '35': { name: 'Alatri', latitude: 41.73, longitude: 13.338333 },
  '36': { name: 'Fontechiari', latitude: 41.67, longitude: 13.674472 },
  '37': { name: 'Leonessa', latitude: 42.572593, longitude: 12.961982 },
  '39': { name: 'Villa Ada', latitude: 41.932874, longitude: 12.506971 },
  '40': 
  { name: 'Castel di Guido',
    latitude: 41.889438,
    longitude: 12.2663 },
  '41': { name: 'Cavaliere', latitude: 41.929383, longitude: 12.658363 },
  '45': { name: 'Ciampino', latitude: 41.79788, longitude: 12.607033 },
  '47': { name: 'Fermi', latitude: 41.864194, longitude: 12.469531 },
  '48': { name: 'Bufalotta', latitude: 41.947649, longitude: 12.533682 },
  '49': { name: 'Cipro', latitude: 41.906358, longitude: 12.447596 },
  '51': 
  { name: 'Latina-Scalo',
    latitude: 41.531431,
    longitude: 12.946064 },
  '52': { name: 'Cassino', latitude: 41.49, longitude: 13.83069 },
  '55': { name: 'Tiburtina', latitude: 41.910257, longitude: 12.54887 },
  '56': { name: 'Arenula', latitude: 41.89402, longitude: 12.475368 },
  '57': { name: 'Malagrotta', latitude: 41.874894, longitude: 12.345598 },
  '59': 
  { name: 'Acquapendente',
    latitude: 42.736649,
    longitude: 11.876578 },
  '60': { name: 'Civ. Porto', latitude: 42.097053, longitude: 11.788354 },
  '61': { name: 'Gaeta', latitude: 41.223074, longitude: 13.570481 },
  '62': { name: 'Frosinone Scalo', latitude: 41.62, longitude: 13.33081 },
  '63': 
  { name: 'Viale De Chirico',
    latitude: 41.451131,
    longitude: 12.891731 },
  '71': 
  { name: 'Frosinone Mazzini',
    latitude: 41.639666,
    longitude: 13.348913 },
  '83': 
  { name: 'Civ. Villa Albani',
    latitude: 42.099363,
    longitude: 11.798061 },
  '84': 
  { name: 'Civ. Via Morandi',
    latitude: 42.086803,
    longitude: 11.806498 },
  '85': 
  { name: 'Civ. Via Roma',
    latitude: 42.094147,
    longitude: 11.795509 },
  '90': 
  { name: 'Civita Castellana',
    latitude: 42.3018,
    longitude: 12.4132 }
}
