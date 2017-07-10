'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import { convertUnits } from '../lib/utils';

// note: this is the 'synchronous' version (lost hours to this!)
import { default as parse } from 'csv-parse/lib/sync';

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
    var data = formatData(body);
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

  var parseDate = function (string) {
    var date = moment.tz(string, 'HHmmss', 'Australia/Hobart');
    return {utc: date.toDate(), local: date.format()};
  };

  // manually retrieved list of station names
  // new stations should be checked for naming on this map:
  // http://epa.tas.gov.au/_layouts/15/Lightbox.aspx?url=http%3A%2F%2Fepa.tas.gov.au%2FAir%2FLive%2Flatest_air_data_on_map.jpg

  var stations = {
    'ST':'Smithton',
    'WY':'Wynyard',
    'ER':'Emu River',
    'WU':'West Ulverstone',
    'DT':'Devonport',
    'SF':'Sheffield',
    'DL':'Deloraine',
    'WE':'Westbury',
    'HA':'Hadspen',
    'LF':'Longford',
    'PE':'Perth',
    'GB':'George Town',
    'EX':'Exeter',
    'TI':'Ti Tree Bend',
    'SL':'South Launceston',
    'LD':'Lilydale',
    'SC':'Scottsdale',
    'DE':'Derby',
    'SH':'St Helens',
    'FI':'Fingal',
    'PO':'Poatina',
    'CT':'Campbell Town',
    'OL':'Oatlands',
    'TR':'Triabunna',
    'BC':'Bream Creek',
    'GR':'Gretna',
    'NN':'New Norfolk',
    'GO':'Glenorchy',
    'HT':'Hobart',
    'MT':'Mornington',
    'JB':'Judbury',
    'HV':'Huonville',
    'CY':'Cygnet',
    'GV':'Geeveston'
  };

  var output = [];
  var measurements = [];

  // parse the csv feed, exclude # lines
  var output = parse(data, {trim: true, comment: '#'});

  // loop through the csv rows
  for(var k = 0; k < output.length; k++)
  {
    //Station, hhmmss(AEST), PM2.5(ug/m^3), PM10(ug/m^3), lat(deg), long(degE), alt(m)
    var value = output[k];
    var currentDate = value[1];

    // Tasmania stations seem to use hhmmss = 999999 when the station
    // is not available. check for and ignore these records
    if (currentDate !== '999999')
    {
      var location = stations[value[0]];
      var dates = parseDate(currentDate);
      var pm25 = value[2];
      var pm10 = value[3];
      var lat = value[4];
      var lng = value[5];
      var alt = value[6];

      // PM2.5 entry
      var m = {
        location: location,
        city: 'Tasmania Region',
        parameter: 'pm25',
        date: dates,
        coordinates: {
        latitude: Number(lat),
        longitude: Number(lng)
      },
      value: Number(pm25),
      unit: 'µg/m³',
      attribution: [{name: 'Environmental Protection Authority - Tasmania', url: 'http://epa.tas.gov.au'}],
      averagingPeriod: {unit: 'minutes', value: 10}
      };
      measurements.push(m);

      // PM10 entry
      var p = {
        location: location,
        city: 'Tasmania Region',
        parameter: 'pm10',
        date: dates,
        coordinates: {
        latitude: Number(lat),
        longitude: Number(lng)
      },
      value: Number(pm10),
      unit: 'µg/m³',
      attribution: [{name: 'Environmental Protection Authority - Tasmania', url: 'http://epa.tas.gov.au'}],
      averagingPeriod: {unit: 'minutes', value: 10}
      };
      measurements.push(p);
    }
  }
  measurements = convertUnits(_.flatten(measurements));
  return {
  name: 'unused',
  measurements: measurements
  };
};


