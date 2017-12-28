/*
 * Script to convert data dump from Accra to proper format for inclusion
 * in the platform. Output of this script needs to be uploaded manually
 * to data bucket.
 */

'use strict';

const parse = require('csv-parse');
const fs = require('fs');
const moment = require('moment-timezone');

const input = fs.readFileSync('accra.csv');
let records = '';
parse(input, (err, output) => {
  if (err) {
    return console.error(err);
  }

  output.forEach((m) => {
    // Create expected format for ndjson files
    let base = {
      date: {
        utc: moment.utc(moment.tz(m[9], 'MM/DD/YY H:mm', 'Africa/Accra')).toDate(),
        local: moment.tz(m[9], 'MM/DD/YY H:mm', 'Africa/Accra').format('YYYY-MM-DDTHH:mm:ssZ')
      },
      parameter: m[0].toLowerCase().replace('.', ''),
      location: `${m[7]} - ${m[6]}`,
      value: Number(m[2]),
      unit: 'µg/m³',
      city: 'Accra',
      attribution: [{
        name: 'Dr. Raphael E. Arku and Colleagues',
        url: m[13]
      }],
      averagingPeriod: {
        value: Number(m[3]),
        unit: 'hours'
      },
      coordinates: {
        latitude: Number(m[11]),
        longitude: Number(m[12])
      },
      country: 'GH',
      sourceName: 'Dr. Raphael E. Arku and Colleagues',
      sourceType: 'research',
      mobile: false
    };

    records += `${JSON.stringify(base)}\n`;
  });

  fs.writeFileSync('accra.ndjson', records);
});
