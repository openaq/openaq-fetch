'use strict';

/*
  Get ARPALAZIO station coordinates
  from project Calicantus source

  Run from project root with:
  node run-scripts.js ./data_scripts/arpalazio.js
*/

import {default as parse} from 'csv-parse/lib/sync';
const request = require('request');

const metadataURL = 'https://raw.githubusercontent.com/jobonaf/calicantus/master/data/sites-info/metadata.ARPA-Lazio.csv';

request(metadataURL, (err, response, body) => {
  if (err) {
    return console.error(err);
  }

  let results = {};
  parse(body, {columns: true}).forEach((rowObject) => {
    results[rowObject.ID] = {
      name: rowObject.NOME,
      latitude: Number(rowObject.LAT),
      longitude: Number(rowObject.LON)
    };
  });
  console.log(results);
});
