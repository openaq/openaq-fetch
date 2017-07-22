'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { parallel } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';
import { default as parse} from 'csv-parse/lib/sync';
import { zip } from 'lodash';

exports.name = 'arpalazio';

exports.fetchData = function (source, cb) {
  const baseUrl = 'http://www.arpalazio.net/main/aria/sci/annoincorso/';
  const provinceQueryPath = 'chimici/chimici.php';
  let datiOrari = 0;
  request(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      console.error(err);
      process.exit();
    }

    const $ = cheerio.load(body);
    let provinces = $('#provincia option')
        .filter(function (i, el) {
          return Number($(this).attr('value')) >= 0
        })
        .map(function(i, el) {
          return { id: $(this).attr('value'), name: $(this).text() }
        }).get();
    console.log(provinces);
    
    provinces.forEach(function (province) {
      const provinceURL = `${baseUrl}${provinceQueryPath}?provincia=${province.id}&dati=${datiOrari}`;
      request(provinceURL, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          console.error(err);
          process.exit();
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
        // retrieve .txt files
        console.log(pollutantURLs);
        //pollutantURLs = pollutantURLs.slice(0, 1);
        pollutantURLs.forEach(function (url) {
          //determine year, pollutant from url
          console.log(url);
          const match = url.match(/[\w]{2}_([\w\.]{2,5})_([\d]{4}).txt/);
          const parameter = match[1].toLowerCase().replace('.', '');
          const year = match[2];
          
          request(url, (err, res, body) => {
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
            //console.log(headers);
            //console.log(records.slice(0, 10));
            records.slice(0, 10).forEach(function(row) {
              const date = moment.tz(`${year} ${row[0]} ${row[1]}`, "YYYY DDD HH", "Europe/Rome");
              const rowValuesOffset = 2;
              row.slice(rowValuesOffset).forEach(function (value, i, _) {
                if (invalidStationIDs.indexOf(headers[i+rowValuesOffset]) >= 0) {
                  return;
                }
                const location = 'Location ' + headers[i+2];
                let m = {
                  date: date.format(),
                  location: location,
                  value: Number(value),
                  city: province.name,
                  parameter: parameter
                };
                console.log(m);
              })
            })
            //process.exit();
          });
        });
      });
    });
  });
}
