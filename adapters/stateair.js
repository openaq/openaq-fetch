'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import log from '../lib/logger';

exports.name = 'stateair';

exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      log.error(err || res);
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body);

      // Make sure the data is valid
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
      }
    };
    var date = moment.tz(dateString, 'YYYY-MM-DD HH:mm:ss', getTZ(location));

    return {utc: date.toDate(), local: date.format()};
  };

  var getCoordinates = function (location) {
    switch (location) {
      case 'Chennai':
        return {
          latitude: 13.052371,
          longitude: 80.251932
        };
      case 'Hyderabad':
        return {
          latitude: 17.443464,
          longitude: 78.474890
        };
      case 'Kolkata':
        return {
          latitude: 22.547142,
          longitude: 88.351048
        };
      case 'Mumbai':
        return {
          latitude: 19.066023,
          longitude: 72.868702
        };
      case 'New Delhi':
        return {
          latitude: 28.598096,
          longitude: 77.189066
        };
      case 'Hanoi':
        return {
          latitude: 21.021770,
          longitude: 105.819002
        }; // Ho Chi Minh City assumes location is at Consulate
      case 'Ho Chi Minh City':
        return {
          latitude: 10.783041,
          longitude: 106.700722
        };
      case 'Ulaanbaatar':
        return {
          latitude: 47.928444,
          longitude: 106.930189
        }; // Jakarta coordinates assume location is at Embassy
      case 'Jakarta South':
        return {
          latitude: -6.236585,
          longitude: 106.793335
        };
      case 'Jakarta Central':
        return {
          latitude: -6.182382,
          longitude: 106.834094
        }; // Lima coordinates assume location is at Embassy
      case 'Lima':
        return {
          latitude: -12.099583,
          longitude: -76.968997
        }; // Dhaka coordinates assume location is at American Center
      case 'Dhaka':
        return {
          latitude: 23.797687,
          longitude: 90.423698
        };
      case 'Bogota':
        return {
          latitude: 4.6379935,
          longitude: -74.0962868
        };
    }
  };

  // Load all the XML
  var $ = cheerio.load(data, {xmlMode: true});

  // Create measurements array
  var measurements = [];

  // Build up the base object
  var location = $('channel').children('title').text().trim();
  var baseObj = {
    location: 'US Diplomatic Post: ' + location,
    parameter: 'pm25',
    unit: 'µg/m³',
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
    var obj = _.cloneDeep(baseObj);

    obj.value = Number($(elem).children('Conc').text());
    obj.date = getDate($(elem).children('ReadingDateTime').text(), location);

    measurements.push(obj);
  });

  return {
    name: 'unused',
    measurements: measurements
  };
};
