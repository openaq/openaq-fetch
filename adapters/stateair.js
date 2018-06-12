'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { parallel } from 'async';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'stateair';

exports.fetchData = function (source, cb) {
  // Generic fetch function
  const getData = (url, done) => {
    return request(url, (err, res, body) => {
      if (err) {
        return done(err);
      } else if (res.statusCode === 404) {
        return done(null, '');
      }

      return done(null, body);
    });
  };
  // Check for PM2.5 and Ozone measurements
  var tasks = {
    'pm25': (done) => {
      getData(source.url, done);
    },
    'o3': (done) => {
      getData(source.url.replace('PM2.5', 'OZONE'), done);
    }
  };

  parallel(tasks, (err, results) => {
    if (err) {
      return cb({message: 'Failure to load data urls.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(results);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

var formatData = function (data) {
  var getDate = function (dateString, location) {
    var getTZ = function (location) {
      switch (location) {
        case 'Chennai':
        case 'Hyderabad':
        case 'Kolkata':
        case 'Mumbai':
        case 'New Delhi':
          return 'Asia/Kolkata';
        case 'Hanoi':
        case 'Ho Chi Minh City':
          return 'Asia/Ho_Chi_Minh';
        case 'Ulaanbaatar':
          return 'Asia/Ulaanbaatar';
        case 'Lima':
          return 'America/Lima';
        case 'Dhaka':
          return 'Asia/Dhaka';
        case 'Jakarta South':
        case 'Jakarta Central':
          return 'Asia/Jakarta';
        case 'Bogota':
          return 'America/Bogota';
        case 'Pristina':
          return 'Europe/Skopje'; // Using Skopje as a same time-zone proxy
        case 'Addis Ababa Central':
        case 'Addis Ababa School':
          return 'Africa/Addis_Ababa';
        case 'Manama':
          return 'Asia/Bahrain';
        case 'Kuwait City':
          return 'Asia/Kuwait';
        case 'Kampala':
          return 'Africa/Kampala';
        case 'Embassy Kathmandu':
        case 'Phora Durbar Kathmandu':
          return 'Asia/Kathmandu';
        case 'Colombo':
          return 'Asia/Colombo';
        case 'Abu Dhabi':
          return 'Asia/Dubai';
        case 'Sarajevo':
          return 'Europe/Sarajevo';
      }
    };
    var date = moment.tz(dateString, 'YYYY-MM-DD HH:mm:ss', getTZ(location));

    return {utc: date.toDate(), local: date.format()};
  };

  var getCoordinates = function (location) {
    switch (location) {
      case 'Chennai':
        return {
          latitude: 13.08784,
          longitude: 80.27847
        };
      case 'Hyderabad':
        return {
          latitude: 17.38405,
          longitude: 78.45636
        };
      case 'Kolkata':
        return {
          latitude: 22.56263,
          longitude: 88.36304
        };
      case 'Mumbai':
        return {
          latitude: 19.07283,
          longitude: 72.88261
        };
      case 'New Delhi':
        return {
          latitude: 28.63576,
          longitude: 77.22445
        };
      case 'Hanoi':
        return {
          latitude: 21.021938,
          longitude: 105.81881
        };
      case 'Ho Chi Minh City':
        return {
          latitude: 10.782773,
          longitude: 106.700035
        };
      case 'Ulaanbaatar':
        return {
          latitude: 47.928387,
          longitude: 106.92947
        };
      case 'Jakarta South':
        return {
          latitude: -6.236704,
          longitude: 106.79324
        };
      case 'Jakarta Central':
        return {
          latitude: -6.182536,
          longitude: 106.834236
        }; // Lima coordinates assume location is at Embassy
      case 'Lima':
        return {
          latitude: -12.099398,
          longitude: -76.96888
        }; // Dhaka coordinates assume location is at American Center
      case 'Dhaka':
        return {
          latitude: 23.796373,
          longitude: 90.424614
        };
      case 'Bogota':
        return {
          latitude: 4.637735,
          longitude: -74.09486
        };
      case 'Pristina':
        return {
          latitude: 42.661995,
          longitude: 21.15055
        };
      case 'Addis Ababa Central':
        return {
          latitude: 9.058498,
          longitude: 38.761642
        };
      case 'Addis Ababa School':
        return {
          latitude: 8.996519,
          longitude: 38.725433
        };
      case 'Manama':
        return {
          latitude: 26.204697,
          longitude: 50.57083
        };
      case 'Kuwait City':
        return {
          latitude: 29.292316,
          longitude: 48.04768
        };
      case 'Kampala':
        return {
          latitude: 0.300225,
          longitude: 32.591553
        };
      case 'Phora Durbar Kathmandu':
        return {
          latitude: 27.712463,
          longitude: 85.315704
        };
      case 'Embassy Kathmandu':
        return {
          latitude: 27.738703,
          longitude: 85.336205
        };
      case 'Colombo':
        return {
          latitude: 6.913253,
          longitude: 79.848684
        }; // Colombo coordinates assume location is at US Embassy
      case 'Abu Dhabi':
        return {
          latitude: 24.424399,
          longitude: 54.433746
        }; // Abu Dhabi coordinates assume location is at US Embassy
      case 'Sarajevo':
        return {
          latitude: 43.856667,
          longitude: 18.398205
        }; // Sarajevo coordinates from https://www.dosairnowdata.org/dos/AllPosts24Hour.json
    }
  };

  // Create measurements array
  let measurements = [];

  // We could have both pm25 and ozone measurements, so loop over
  // results object
  for (let parameter in data) {
    // Load all the XML
    const $ = cheerio.load(data[parameter], {xmlMode: true});

    // Build up the base object
    const location = $('channel').children('title').text().trim();
    const baseObj = {
      location: 'US Diplomatic Post: ' + location,
      parameter: parameter,
      unit: (parameter === 'pm25') ? 'µg/m³' : 'ppb',
      averagingPeriod: {'value': 1, 'unit': 'hours'},
      attribution: [{
        name: 'EPA AirNow DOS',
        url: 'http://airnow.gov/index.cfm?action=airnow.global_summary'
      }],
      coordinates: getCoordinates(location)
    };

    // Loop over each item and save the object
    $('item').each(function (i, elem) {
      // Clone base object
      const obj = _.cloneDeep(baseObj);

      obj.value = Number($(elem).children('Conc').text());
      obj.date = getDate($(elem).children('ReadingDateTime').text(), location);

      measurements.push(obj);
    });
  }

  measurements = convertUnits(measurements);

  return {
    name: 'unused',
    measurements: measurements
  };
};
