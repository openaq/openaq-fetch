'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');
var cheerio = require('cheerio');
var log = require('../lib/logger');

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
          return 'Asia/Ho_Chi_Minh';
        case 'Ulaanbaatar':
          return 'Asia/Ulaanbaatar';
        case 'Jakarta South':
          return 'Asia/Jakarta';
        case 'Jakarta Central':
          return 'Asia/Jakarta';
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
