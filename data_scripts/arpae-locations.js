'use strict';

/*
   A script for generating a locations mapping
   object from the ARPAE parameters source.

 */

import { default as parse } from 'csv-parse/lib/sync';
import { uniqBy } from 'lodash';
var request = require('request');

const csvUrl = 'https://docs.google.com/spreadsheets/d/1GlY3Pu9GDpLDk8Spl9yV1wjCRPvOI1m7BFxumfcuGcE/export?format=csv';

request(csvUrl, (err, res, data) => {
  if (err) {
    console.log(err);
  }

  const parsed = parse(data, { columns: true });
  let locations = {};
  uniqBy(parsed, 'Cod_staz').forEach((o) => {
    locations[o.Cod_staz] = {
      station: o.Stazione,
      comune: o.COMUNE,
      coordinates: {
        latitude: Number(o.Lat),
        longitude: Number(o.Lon)
      }
    };
  });
  console.log(locations);
});
