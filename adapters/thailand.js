'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'thailand';

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

var formatData = function (body) {
  var measurements = [];
  var $ = cheerio.load(body);

  var coordinates = {
    '02t': { longitude: 100.48601837802, latitude: 13.732878086814 },
    '03t': { longitude: 100.50581203933, latitude: 13.66846068306 },
    '05t': { longitude: 100.60574118114, latitude: 13.666116121283 },
    '08t': { longitude: 100.54340633012, latitude: 13.66402619452 },
    '10t': { longitude: 100.636548, latitude: 13.78152 },
    '11t': { longitude: 100.56892844813, latitude: 13.775373291477 },
    '12t': { longitude: 100.54734529366, latitude: 13.708041021603 },
    '13t': { longitude: 100.50631878903, latitude: 13.807158152425 },
    '14t': { longitude: 100.31567469065, latitude: 13.705459031688 },
    '15t': { longitude: 100.44598735492, latitude: 13.684229480854 },
    '17t': { longitude: 100.53183964688, latitude: 13.652156925663 },
    '19t': { longitude: 100.78940318041, latitude: 13.567696531322 },
    '20t': { longitude: 100.60873959621, latitude: 14.040299305494 },
    '21t': { longitude: 100.56853549578, latitude: 14.349366683822 },
    '22t': { longitude: 100.53565359343, latitude: 13.907826934415 },
    '24t': { longitude: 100.87513981078, latitude: 14.683085094818 },
    '25t': { longitude: 100.92917127159, latitude: 14.523536277394 },
    '26t': { longitude: 99.814873, latitude: 13.532555 },
    '27t': { longitude: 100.264254, latitude: 13.550478 },
    '28t': { longitude: 101.212844, latitude: 12.97378 },
    '30t': { longitude: 101.27357778829, latitude: 12.680918537711 },
    '31t': { longitude: 101.13567139733, latitude: 12.735201666146 },
    '32t': { longitude: 100.91849922412, latitude: 13.119234177302 },
    '33t': { longitude: 100.92769331172, latitude: 13.173601347345 },
    '34t': { longitude: 100.98454092591, latitude: 13.360626576582 },
    '36t': { longitude: 98.988666, latitude: 18.791092 },
    '37t': { longitude: 99.506314173843, latitude: 18.286776118257 },
    '38t': { longitude: 99.766891808156, latitude: 18.247769049494 },
    '39t': { longitude: 99.727046, latitude: 18.419425 },
    '40t': { longitude: 99.663144703624, latitude: 18.279680637193 },
    '41t': { longitude: 100.1319285287, latitude: 15.707848227166 },
    '42t': { longitude: 99.320715944922, latitude: 9.1368079509525 },
    '43t': { longitude: 98.394290593566, latitude: 7.8816363400512 },
    '44t': { longitude: 100.29000030001, latitude: 7.010000800002 },
    '46t': { longitude: 102.835251, latitude: 16.445329 },
    '47t': { longitude: 102.10219652705, latitude: 14.976785802969 },
    '50t': { longitude: 100.53649416504, latitude: 13.729830133162 },
    '52t': { longitude: 100.48660439296, latitude: 13.727559345309 },
    '53t': { longitude: 100.59607755884, latitude: 13.79263500923 },
    '54t': { longitude: 100.550598, latitude: 13.762406 },
    '57t': { longitude: 99.823357055937, latitude: 19.909242469583 },
    '58t': { longitude: 97.971525255487, latitude: 19.304501021455 },
    '59t': { longitude: 100.537798, latitude: 13.780444 },
    '60t': { longitude: 101.286359, latitude: 13.588554 },
    '61t': { longitude: 100.614562, latitude: 13.76963 },
    '62t': { longitude: 101.823568, latitude: 6.427698 },
    '63t': { longitude: 101.27999862621, latitude: 6.5499937928872 },
    '68t': { longitude: 99.011144750057, latitude: 18.564721437399 },
    '69t': { longitude: 100.1654, latitude: 18.12614 },
    '70t': { longitude: 100.170326, latitude: 19.190056 },
    '71t': { longitude: 102.50620686398, latitude: 13.689028480765 },
    '72t': { longitude: 100.52907795047, latitude: 13.763936293311 },
    '73t': { longitude: 99.83000059939, latitude: 19.909995209649 },
    '74t': { longitude: 101.1818364, latitude: 12.7053545 },
    '75t': { longitude: 101.048298, latitude: 19.540055 },
    'a08': { longitude: 100.54340633012, latitude: 13.66402619452 },
    'a16': { longitude: 100.52907795047, latitude: 13.763936293311 },
    'a18': { longitude: 100.60046446423, latitude: 13.596314064923 },
    'a29': { longitude: 101.16605097923, latitude: 12.708296915688 },
    'a35': { longitude: 98.973019227081, latitude: 18.837829920288 },
    'a49': { longitude: 100.551338, latitude: 13.797855 },
    'a67': { longitude: 100.77952643048, latitude: 18.786142045273 }
  };

  var createLocationObj = function (row) {
    var text = $($(row).children().get(1)).text();
    // It looks like if we have English, there are commas, if no commas
    // and it's in Thai, just spaces. For now, ignore result in Thai until
    // we can find someone who can tell us how to parse it.
    text = text.split(',');
    if (text.length === 1) {
      return {city: null, location: null};
    }
    var city = text.pop().trim();
    var location = text.join(',').trim();

    return {city: city, location: location};
  };

  var createDateObj = function (row) {
    var date = $($(row).children().get(2)).text();
    var hour = $($(row).children().get(3)).text();
    var rDate = moment.tz(date + ' ' + hour, 'YYYY/MM/DD HH:mm:ss', 'Asia/Bangkok');

    return {utc: rDate.toDate(), local: rDate.format()};
  };

  $('#table-body tr').each(function (i, row) {
    // Skip if the id isn't three characters
    if ($(row).children().first().text().trim().length !== 3) {
      return;
    }

    // Create base measurement
    var m = {};

    // Location
    _.assign(m, createLocationObj(row));

    // Related to Thai entry on English page, check for valid location
    if (m.location === null) {
      return;
    }

    // Date
    m.date = createDateObj(row);

    // Coordinates
    m.coordinates = coordinates[$($(row).children().get(0)).text().trim()];

    // Attribution
    m.attribution = [{'name': 'Pollution Control Department', 'url': 'http://www.aqmthai.com/index.php'}];

    // Unique CO measurement, if valid
    var value = $($(row).children().get(4)).text().trim();
    if (value !== ' ' && value !== '' && value !== '-' && value !== 'No Data') {
      var co = _.cloneDeep(m);
      co.parameter = 'co';
      co.value = Number(value);
      co.unit = 'ppm';
      co.averagingPeriod = {'value': 1, 'unit': 'hours'};
      measurements.push(co);
    }

    // Unique NO2 measurement, if valid
    value = $($(row).children().get(5)).text().trim();
    if (value !== ' ' && value !== '' && value !== '-' && value !== 'No Data') {
      var no2 = _.cloneDeep(m);
      no2.parameter = 'no2';
      no2.value = Number(value);
      no2.unit = 'ppb';
      no2.averagingPeriod = {'value': 1, 'unit': 'hours'};
      measurements.push(no2);
    }

    // Unique O3 measurement, if valid
    value = $($(row).children().get(6)).text().trim();
    if (value !== ' ' && value !== '' && value !== '-' && value !== 'No Data') {
      var o3 = _.cloneDeep(m);
      o3.parameter = 'o3';
      o3.value = Number(value);
      o3.unit = 'ppb';
      o3.averagingPeriod = {'value': 1, 'unit': 'hours'};
      measurements.push(o3);
    }

    // Unique SO2 measurement, if valid
    value = $($(row).children().get(7)).text().trim();
    if (value !== ' ' && value !== '' && value !== '-' && value !== 'No Data') {
      var so2 = _.cloneDeep(m);
      so2.parameter = 'so2';
      so2.value = Number(value);
      so2.unit = 'ppb';
      so2.averagingPeriod = {'value': 1, 'unit': 'hours'};
      measurements.push(so2);
    }

    // Unique PM10 measurement, if valid
    value = $($(row).children().get(8)).text().trim();
    if (value !== ' ' && value !== '' && value !== '-' && value !== 'No Data') {
      var pm10 = _.cloneDeep(m);
      pm10.parameter = 'pm10';
      pm10.value = Number(value);
      pm10.unit = 'µg/m³';
      pm10.averagingPeriod = {'value': 24, 'unit': 'hours'};
      measurements.push(pm10);
    }
  });

  measurements = convertUnits(measurements);

  return {
    name: 'unused',
    measurements: measurements
  };
};
