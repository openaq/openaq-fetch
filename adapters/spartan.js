'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import AdmZip from 'adm-zip';
import { parallel } from 'async';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'spartan';

export const fetchData = function (source, cb) {
  request({url: source.url, encoding: null}, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Read the data files in the zip
      let tasks = {};
      const zip = new AdmZip(body);
      const entries = zip.getEntries();
      entries.forEach(function (zipEntry) {
        // Parse the data if it's the data file we want
        if (zipEntry.entryName.indexOf('PM_hourly/PMhourly_') !== -1) {
          const locationCode = /^(\S+).csv$/.exec(zipEntry.name)[1];
          const zipData = zipEntry.getData().toString('utf8');
          tasks[locationCode] = function (done) {
            let measurements = [];
            let colNames = [];
            zipData.split('\n').forEach((l, i) => {
              if (i === 0) {
                // Skip first line
              } else if (i === 1) {
                // Save col names on line 1
                colNames = l.split(',');
              } else {
                // Save individual measurement objects
                measurements.push({
                  date: l.split(',')[colNames.indexOf('DateTime')],
                  bc: l.split(',')[colNames.indexOf('Black_carbon')],
                  pm25: l.split(',')[colNames.indexOf('PM25_hourly')]
                });
              }
            });

            return done(null, measurements);
          };
        }
      });

      parallel(tasks, (err, results) => {
        if (err) {
          return cb({message: 'Failure to unzip data.'});
        }

        // Format the data
        const data = formatData(results);

        // Make sure the data is valid
        if (data === undefined) {
          return cb({message: 'Failure to parse data.'});
        }
        cb(null, data);
      });
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

const formatData = function (data) {
  var getDate = function (dateString, location) {
    var getTZ = function (location) {
      switch (location) {
        case 'IDBD':
          return 'Asia/Jakarta';
        case 'ARCB':
          return 'America/Argentina/Buenos_Aires';
        case 'BDDU':
          return 'Asia/Dhaka';
        case 'USEM':
          return 'US/Eastern';
        case 'INKA':
          return 'Asia/Kolkata';
        case 'USMC':
          return 'US/Eastern';
        case 'PHMO':
          return 'Asia/Manila';
        case 'ILNZ':
          return 'Asia/Jerusalem';
        case 'CHTS':
          return 'Asia/Shanghai';
        case 'NGIL':
          return 'Africa/Lagos';
        case 'ZAPR':
          return 'Africa/Johannesburg';
        case 'SGSU':
          return 'Asia/Singapore';
        case 'VNHN':
          return 'Asia/Ho_Chi_Minh';
      }
    };
    var date = moment.tz(dateString, 'YYYY/MM/DD HH:mm:ss', getTZ(location));

    return {utc: date.toDate(), local: date.format()};
  };

  var getLocation = function (location) {
    switch (location) {
      case 'INKA':
        return {
          location: 'SPARTAN - IIT Kanpur',
          city: 'Kanpur',
          country: 'IN'
        };
      case 'CHTS':
        return {
          location: 'SPARTAN - Tsinghua University',
          city: 'Beijing',
          country: 'CN'
        };
      case 'BDDU':
        return {
          location: 'SPARTAN - Dhaka University',
          city: 'Dhaka',
          country: 'BD'
        };
      case 'USEM':
        return {
          location: 'SPARTAN - Emory University',
          city: 'Atlanta',
          country: 'US'
        };
      case 'USMC':
        return {
          location: 'SPARTAN - Mammoth Cave',
          city: 'Mammoth Cave NP',
          country: 'US'
        };
      case 'PHMO':
        return {
          location: 'SPARTAN - Manila Observatory',
          city: 'Manila',
          country: 'PH'
        };
      case 'ARCB':
        return {
          location: 'SPARTAN - CITEDEF',
          city: 'Buenos Aires',
          country: 'AR'
        };
      case 'NGIL':
        return {
          location: 'SPARTAN - Ilorin University',
          city: 'Ilorin',
          country: 'NG'
        };
      case 'IDBD':
        return {
          location: 'SPARTAN - ITB Bandung',
          city: 'Bandung',
          country: 'ID'
        };
      case 'VNHN':
        return {
          location: 'SPARTAN - Vietnam Acad. Sci.',
          city: 'Hanoi',
          country: 'VN'
        };
      case 'SGSU':
        return {
          location: 'SPARTAN - NUS',
          city: 'Singapore',
          country: 'SG'
        };
      case 'ILNZ':
        return {
          location: 'SPARTAN - Weizmann Institute',
          city: 'Rehovot',
          country: 'IL'
        };
      case 'ZAPR':
        return {
          location: 'SPARTAN - CSIR',
          city: 'Pretoria',
          country: 'ZA'
        };
    }
  };

  var getCoordinates = function (location) {
    switch (location) {
      case 'INKA':
        return {
          latitude: 26.519,
          longitude: 80.233
        };
      case 'CHTS':
        return {
          latitude: 40.010,
          longitude: 116.333
        };
      case 'BDDU':
        return {
          latitude: 23.728,
          longitude: 90.398
        };
      case 'USEM':
        return {
          latitude: 33.688,
          longitude: -84.290
        };
      case 'USMC':
        return {
          latitude: 37.132,
          longitude: -86.148
        };
      case 'PHMO':
        return {
          latitude: 14.635,
          longitude: 121.080
        };
      case 'ARCB':
        return {
          latitude: -34.560,
          longitude: -58.506
        };
      case 'NGIL':
        return {
          latitude: 8.484,
          longitude: 4.675
        };
      case 'IDBD':
        return {
          latitude: -6.888,
          longitude: 107.610
        };
      case 'VNHN':
        return {
          latitude: 21.048,
          longitude: 105.800
        };
      case 'SGSU':
        return {
          latitude: 1.298,
          longitude: 103.780
        };
      case 'ILNZ':
        return {
          latitude: 31.907,
          longitude: 34.810
        };
      case 'ZAPR':
        return {
          latitude: -25.756,
          longitude: 28.280
        };
    }
  };

  // Create measurements array
  var measurements = [];

  // Loop over each data file and build up measurements
  Object.keys(data).forEach((loc) => {
    // Get the unique code
    const locCode = /^\S+_(\w+)$/.exec(loc)[1];

    // Build up the base object
    let baseObj = {
      averagingPeriod: {'value': 1, 'unit': 'hours'},
      sourceType: 'research',
      mobile: false,
      attribution: [{
        name: 'SPARTAN Network',
        url: 'http://www.spartan-network.org/'
      }],
      coordinates: getCoordinates(locCode)
    };

    // Add location info
    Object.assign(baseObj, getLocation(locCode));

    // If we don't have a valid location name, bail out
    if (!baseObj.location) {
      return;
    }

    // Loop over location data and get measurements
    data[loc].forEach((item) => {
      // Make sure we have a datetime
      if (!item.date) {
        return;
      }

      if (item.pm25 !== undefined && !isNaN(item.pm25)) {
        let m = Object.assign({}, baseObj);
        m.parameter = 'pm25';
        m.unit = 'µg/m³';
        m.value = Number(item.pm25);
        m.date = getDate(item.date, locCode);
        measurements.push(m);
      }

      // Not tracking BC for now because of https://github.com/openaq/openaq-fetch/pull/173#issuecomment-228565996
      // if (item.bc !== undefined && !isNaN(item.bc)) {
      //   let m = Object.assign({}, baseObj);
      //   m.parameter = 'bc';
      //   m.unit = 'µg/m³';
      //   m.value = Number(item.bc);
      //   m.date = getDate(item.date, locCode);
      //   measurements.push(m);
      // }
    });
  });

  return {
    name: 'unused',
    measurements: measurements
  };
};
