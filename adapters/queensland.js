'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { removeUnwantedParameters } from '../lib/utils';

exports.name = 'queensland';

exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb(err || res);
    }

    try {
      var data = formatData(body, source);
      var result = {
        name: 'unused',
        measurements: _.flatten(data)
      };

      result.measurements = removeUnwantedParameters(result.measurements);
      cb(null, result);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

const renameParameter = function (parameter) {
  switch (parameter) {
    case 'Nitrogen Dioxide':
      return 'no2';
    case 'Sulfur Dioxide':
      return 'so2';
    case 'Carbon Monoxide':
      return 'co';
    case 'Particle PM2.5':
      return 'pm25';
    case 'Ozone':
      return 'o3';
    case 'Particle PM10':
      return 'pm10';
    default:
      return parameter;
  }
};

var formatData = function (data, source) {
  var $ = cheerio.load(data, {xmlMode: true});

  var dateStr = $('category').attr('measurementdate') + $('category').attr('measurementhour');
  var date = moment.tz(dateStr, 'YYYY-MM-DDHH', 'Australia/Queensland');
  var dates = {utc: date.toDate(), local: date.format()};

  var measurements = [];

  // todo:
  // set relative units
  // pinpoint cities from coordinates

  $('measurement').each(function (i, elem) {
    var location = $(this).parent().attr('name');

    var m = {
      date: dates,
      parameter: renameParameter($(this).attr('name')),
      location: location,
      value: Number($(this).text()),
      unit: 'µg/m³',
      city: 'Unknown',
      region: $(this).parent().parent().attr('name'),
      attribution: [{
        name: source.name,
        url: source.sourceURL
      }],
      averagingPeriod: {'value': 1, 'unit': 'hours'},
      coordinates: getCoordinates(location)
    };
    measurements.push(m);
  });

  return measurements;
};

export const getCoordinates = function (location) {
  
  let coordinates = {
    "Abbot Point": {
        "latitude": -19.9496,
        "longitude": 148.0482
    },
    "Aldoga": {
        "latitude": -23.8403,
        "longitude": 151.0628
    },
    "Arundel": {
        "latitude": -27.9441,
        "longitude": 153.3656
    },
    "Auckland Point": {
        "latitude": -23.8351,
        "longitude": 151.2539
    },
    "Ayr": {
        "latitude": -19.5839,
        "longitude": 147.4059
    },
    "Boat Creek": {
        "latitude": -23.8199,
        "longitude": 151.1538
    },
    "Boyne Island": {
        "latitude": -23.9408,
        "longitude": 151.3507
    },
    "Brisbane CBD": {
        "latitude": -27.4774,
        "longitude": 153.0281
    },
    "Cannon Hill": {
        "latitude": -27.4654,
        "longitude": 153.0872
    },
    "Clinton": {
        "latitude": -19.3212,
        "longitude": 146.8422
    },
    "Deception Bay": {
        "latitude": -27.1935,
        "longitude": 153.0347
    },
    "Flinders View": {
        "latitude": -27.6528,
        "longitude": 152.7741
    },
    "Gatton": {
        "latitude": -27.5434,
        "longitude": 152.3343
    },
    "Jondaryan": {
        "latitude": -27.3713,
        "longitude": 151.5934
    },
    "Josephville": {
        "latitude": -27.9962,
        "longitude": 152.9255
    },
    "Lutwyche": {
        "latitude": -27.4166,
        "longitude": 153.0376
    },
    "Lytton": {
        "latitude": -27.4065,
        "longitude": 153.1527
    },
    "Memorial Park": {
        "latitude": -23.8443,
        "longitude": 151.2517
    },
    "Menzies": {
        "latitude": -20.7167,
        "longitude": 139.492
    },
    "Moranbah": {
        "latitude": -21.9995,
        "longitude": 148.0713
    },
    "Mountain Creek": {
        "latitude": -26.6917,
        "longitude": 153.1038
    },
    "Mutdapilly": {
        "latitude": -27.7528,
        "longitude": 152.6509
    },
    "North Maclean": {
        "latitude": -27.7708,
        "longitude": 153.03
    },
    "Pimlico": {
        "latitude": -19.2871,
        "longitude": 146.7813
    },
    "Pinkenba": {
        "latitude": -27.4187,
        "longitude": 153.133
    },
    "Rocklea": {
        "latitude": -27.5358,
        "longitude": 152.9934
    },
    "South Brisbane": {
        "latitude": -27.4848,
        "longitude": 153.0321
    },
    "South Gladstone": {
        "latitude": -23.8626,
        "longitude": 151.2705
    },
    "Springwood": {
        "latitude": -27.6125,
        "longitude": 153.1359
    },
    "Stuart": {
        "latitude": -19.3212,
        "longitude": 146.8422
    },
    "Targinie": {
        "latitude": -23.7744,
        "longitude": 151.1055
    },
    "The Gap": {
        "latitude": -20.7264,
        "longitude": 139.4977
    },
    "Coastguard": {
        "latitude": -19.2542,
        "longitude": 146.8257
    },
    "West Mackay": {
        "latitude": -21.1595,
        "longitude": 149.1549
    },
    "Woolloongabba": {
        "latitude": -27.4975,
        "longitude": 153.035
    },
    "Wynnum": {
        "latitude": -27.4296,
        "longitude": 153.1581
    },
    "Wynnum North": {
        "latitude": -27.4296,
        "longitude": 153.1581
    },
    "Wynnum West": {
        "latitude": -27.4379,
        "longitude": 153.1495
    }
  }

  try {
    return coordinates[location];
  } catch(err) {
    return {};
  };

};
