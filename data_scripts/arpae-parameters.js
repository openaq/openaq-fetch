'use strict';

/*
   A script for generating a parameter mapping
   object from the ARPAE parameters source.

 */

import { default as parse } from 'csv-parse/lib/sync';
var request = require('request');

const csvUrl = 'https://docs.google.com/spreadsheets/d/13QcqldwA3EQ_4E17Hqggd2ZcMgUA5UwACttAWEkaU28/export?format=csv';

request(csvUrl, (err, res, data) => {
  if (err) {
    console.err(err);
  }
  const parsed = parse(data, { columns: true });
  let parameters = {};
  parsed.forEach((el) => {
    parameters[el.IdParametro] = {
      parameter: el.PARAMETRO.split('(')[0].toLowerCase().trim(),
      unit: el.UM
    };
  });
  console.log(parameters);
});
