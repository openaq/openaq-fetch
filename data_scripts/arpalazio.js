'use strict';

/*
  Get ARPALAZIO station coordinates
  from project Calicantus source

  Run from project root with:
  node run-scripts.js ./data_scripts/arpalazio.js
*/

const request = require('request');
import {default as parse} from 'csv-parse/lib/sync';

const metadataURL = 'https://raw.githubusercontent.com/jobonaf/calicantus/master/data/sites-info/metadata.ARPA-Lazio.csv';

request(metadataURL, (err, response, body) => {
  if (err) {
    return console.error(err);
  }

  let results = {};
  parse(body, {columns: true}).forEach((rowObject) => {
    results[rowObject.ID] = {
      name: rowObject.NOME,
      latitude: rowObject.LAT,
      longitude: rowObject.LON
    };
  });
  console.log(results);
});
