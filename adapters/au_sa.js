'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { cloneDeep } from 'lodash';
import { default as moment } from 'moment-timezone';
// note: this is the 'synchronous' version (lost hours to this!)
import { default as parse } from 'csv-parse/lib/sync';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'au_sa';

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
      console.error(e);
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

// site locations retrieved from https://data.sa.gov.au/data/dataset/a768c1f5-9714-4576-90bd-9dddaaa66ce4
var siteLocations = {
  'chr': [ 138.4951966, -35.1349443 ],
  'eli': [ 138.6957631, -34.6984929 ],
  'ken': [ 138.6650977, -34.9214075 ],
  'lef1': [ 138.4963475, -34.8386688 ],
  'net': [ 138.549098, -34.9438035 ],
  'nor': [ 138.6229313, -34.8620143 ],
  'ptp_o': [ 138.0198974, -33.1947947 ],
  'why_s': [ 137.5332255, -33.023596 ],
  'lef2': [ 138.4978642, -34.79128 ],
  'cbd': [ 138.6010841, -34.92889 ],
  'ptp_t': [ 138.0037294, -33.1711633 ],
  'why_w': [ 137.5860979, -33.0361164 ],
  'pta': [ 137.7868467, -32.5100065 ]
};

var siteCities = {
  'chr': 'Adelaide',
  'eli': 'Adelaide',
  'ken': 'Adelaide',
  'lef1': 'Adelaide',
  'net': 'Adelaide',
  'nor': 'Adelaide',
  'ptp_o': 'Port Pirie',
  'why_s': 'Whyalla',
  'lef2': 'Adelaide',
  'cbd': 'Adelaide',
  'ptp_t': 'Port Pirie',
  'why_w': 'Whyalla',
  'pta': 'Port Augusta'
};

// remove non numeric values
function parseValue (value) {
  if (value === null || value === 'NM' || value === 'NA') {
    return null;
  }

  var number = Number(value);
  if (Number.isNaN(number)) {
    return null;
  }

  return number;
}

var formatData = function (data, source) {
  var units = {
    'no2': 'ppm',
    'o3': 'ppm',
    'co': 'ppm',
    'so2': 'ppm',
    'pm10': 'µg/m³',
    'pm25': 'µg/m³'
  };

  var measurements = [];

  // parse the csv feed, exclude # lines
  var rows = parse(data, {
    trim: true,
    comment: '#',
    relax_column_count: true
  });

  // header row contains the date/time
  var day = rows[0][1];
  var month = rows[0][2];
  var year = rows[0][3];
  var time = rows[0][4];

  // according to https://data.sa.gov.au/data/dataset/recent-air-quality/resource/d8abf079-9c51-4a0c-b827-dca926c4e95b
  // "Times shown ... are Australian Central Standard Time (ACST). During
  // daylight savings an hour will need to be added to the times shown."
  // Hence we specifiy the date time is in +09:30 ie. ACST, this then gets
  // correctly formatted to local time in Australia/Adelaide
  var date = moment.tz(`${day} ${month} ${year} ${time} +09:30`, 'DD MMMM YYYY HH:mm ZZ', 'Australia/Adelaide');
  var dateObject = {utc: date.toDate(), local: date.format()};

  // loop through the remaining csv rows, which each contain a location
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];

    var siteName = row[2];

    var siteRef = row[3].replace(/_dm.jpg$/, '');

    var parameterValues = {
      'o3': parseValue(row[4]),
      'co': parseValue(row[5]),
      'no2': parseValue(row[6]),
      'so2': parseValue(row[7]),
      'pm10': parseValue(row[8]),
      'pm25': parseValue(row[9])
    };

    // base measurement properties
    var baseMeasurement = {
      location: siteName,
      city: siteCities[siteRef],
      country: 'AU',
      date: dateObject,
      sourceName: source.name,
      sourceType: 'government',
      mobile: false,
      coordinates: {
        latitude: siteLocations[siteRef][1],
        longitude: siteLocations[siteRef][0]
      },
      attribution: [{
        name: 'Environment Protection Authority (EPA), South Australia',
        url: source.sourceURL
      }],
      averagingPeriod: {'value': 1, 'unit': 'hours'}
    };

    Object.keys(parameterValues).forEach(function (parameter) {
      if (parameterValues[parameter] !== null) {
        var measurement = cloneDeep(baseMeasurement);
        measurement.parameter = parameter;
        measurement.value = parameterValues[parameter];
        measurement.unit = units[parameter];

        measurements.push(measurement);
      }
    });
  }

  return {
    name: 'unused',
    measurements: measurements
  };
};
