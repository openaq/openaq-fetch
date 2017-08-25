'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { flatten, cloneDeep } from 'lodash';
import { default as moment } from 'moment-timezone';
import { convertUnits } from '../lib/utils';
// note: this is the 'synchronous' version (lost hours to this!)
import { default as parse } from 'csv-parse/lib/sync';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'tasmania';

exports.fetchData = function (source, cb) {
  // Fetch the data
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body, source);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

var formatData = function (data, source) {
  var parseDate = function (string) {
    var date = moment.tz(string, 'HHmmss', 'Australia/Hobart');
    return {utc: date.toDate(), local: date.format()};
  };
  // manually retrieved list of station names
  // new stations should be checked for naming on this map:
  // http://epa.tas.gov.au/_layouts/15/Lightbox.aspx?url=http%3A%2F%2Fepa.tas.gov.au%2FAir%2FLive%2Flatest_air_data_on_map.jpg

  var stations = {
    'ST': 'Smithton',
    'WY': 'Wynyard',
    'ER': 'Emu River',
    'WU': 'West Ulverstone',
    'DT': 'Devonport',
    'SF': 'Sheffield',
    'DL': 'Deloraine',
    'WE': 'Westbury',
    'HA': 'Hadspen',
    'LF': 'Longford',
    'PE': 'Perth',
    'GB': 'George Town',
    'EX': 'Exeter',
    'TI': 'Ti Tree Bend',
    'SL': 'South Launceston',
    'LD': 'Lilydale',
    'SC': 'Scottsdale',
    'DE': 'Derby',
    'SH': 'St Helens',
    'FI': 'Fingal',
    'PO': 'Poatina',
    'CT': 'Campbell Town',
    'OL': 'Oatlands',
    'TR': 'Triabunna',
    'BC': 'Bream Creek',
    'GR': 'Gretna',
    'NN': 'New Norfolk',
    'GO': 'Glenorchy',
    'HT': 'Hobart',
    'MT': 'Mornington',
    'JB': 'Judbury',
    'HV': 'Huonville',
    'CY': 'Cygnet',
    'GV': 'Geeveston'
  };

  var output = [];
  var measurements = [];

  // parse the csv feed, exclude # lines
  output = parse(data, {trim: true, comment: '#'});

  // loop through the csv rows
  for (var k = 0; k < output.length; k++) {
    // Station, hhmmss(AEST), PM2.5(ug/m^3), PM10(ug/m^3), lat(deg), long(degE), alt(m)
    var value = output[k];
    var currentDate = value[1];

    // Tasmania stations seem to use hhmmss = 999999 when the station
    // is not available. check for and ignore these records
    // also check the name matched in the locations list, otherwise this is a new station
    var location = stations[value[0]];
    if (currentDate === '999999' || location === 'undefined') {
      continue;
    }
    var dates = parseDate(currentDate);
    var pm25 = value[2];
    var pm10 = value[3];
    var lat = value[4];
    var lng = value[5];

    // base obj for resuse
    const baseObj = {
      location: location,
      city: source.city,
      unit: 'µg/m³',
      averagingPeriod: {'value': 0.25, 'unit': 'hours'},
      attribution: [{
        name: 'Environmental Protection Authority - Tasmania',
        url: 'http://epa.tas.gov.au'}
      ],
      coordinates: {
        latitude: Number(lat),
        longitude: Number(lng)
      },
      date: dates
    };

    // PM2.5 entry
    var objPM25 = cloneDeep(baseObj);
    objPM25.value = Number(pm25);
    objPM25.parameter = 'pm25';
    measurements.push(objPM25);

    // PM10 entry
    var objPM10 = cloneDeep(baseObj);
    objPM10.value = Number(pm10);
    objPM10.parameter = 'pm10';
    measurements.push(objPM10);
  }
  measurements = convertUnits(flatten(measurements));
  return {
    name: 'unused',
    measurements: measurements
  };
};
