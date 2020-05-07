/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data from Singapore
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import { default as rp } from 'request-promise-native';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'singapore';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = async function (source, cb) {
  //getting timestamp key for the rest of the data
  const timeRp = await rp({method: 'GET', uri: 'https://www.haze.gov.sg/api/UnixTime/GetTime/8a4b67b6-27d9-f2ec-a203-a45178ecefa8', resolveWithFullResponse: true});
  const time = JSON.parse(timeRp.body);
  request(source.url+time, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body);
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

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
var formatData = function (result) {
  try {
    var data = JSON.parse(result);
  } catch (e) {
    return undefined;
  }
  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var parseDate = function (m) {
    var hour = (String(m).substring(m.length-2)==='AM') ? Number(String(m).substring(m.length-2,m.length-4)) : (12+Number(String(m).substring(m.length-2,m.length-4)));
    m = String(m).substring(0,m.length-4);
    m = moment(new Date(m)).add(hour,'hours');
    var date = moment.tz(m, 'YYYY-MM-DDHH:mm', 'Asia/Singapore');
    return {utc: date.toDate(), local: date.format()};
  };
  /**
   * Tranforms the PSI of site, based on formula from https://www.haze.gov.sg/docs/default-source/faq/computation-of-the-pollutant-standards-index-(psi).pdf
   * @param {Number} v value to be tranformed
   * @param {Arraylist} params the list of breakpoints of each param
   * @return {Number} trasformed value into 'µg/m³'
   */
  var parseValue = function (v, params) {
    // All data except pm25 is converted used a specific formula, 
    // luckily it was provided, so we can revers engineer it and get the value wanted
    var index = [[0, 50], [50, 100], [100, 200], [200, 300], [300, 400], [400, 500]];
    for (var i = 0; i < index.length; i++) {
      if(v > index[i][0] && v <= index[i][1]) {
        return ((v - index[i][0]) * ((params[i][1] - params[i][0]) / (index[i][1] - index[i][0])) + params[i][0]);
      }
    }
    return -1;
  }
  var measurements = [];
  sensorTypes.forEach(sensor => {
    stations.forEach(station => {
      var base = {
        city: 'Singapore',
        location: station.location,
        parameter: sensor.parameter,
        unit: 'µg/m³',
        coordinates : station.coordinates,
        attribution: [
          {name: 'NEA Singapore', url: 'https://www.nea.gov.sg/our-services/pollution-control'},
        ]
      };
      data[sensor.sensorName][station.stationName].Data.forEach(d => {
        // It seems that some of the sensor are inactive, because they only register the value 0
        // does look to mainly be the NO2 sensor
        if(d.value !== 0) {
          var v = (sensor.parameter === 'pm25') ? d.value : parseValue(d.value, sensor.index);
          if (sensor.parameter === 'co') v *= 1000;
          measurements.push(Object.assign({
            date: parseDate(d.dateTime),
            value: v
          }, base));
        }
      });
    });
  });
 return {
    name: 'unused',
    measurements: measurements
  };
};
var sensorTypes = [
  {
    sensorName: 'Chart1HRPM25',
    parameter: 'pm25',
  },
  {
    sensorName: 'ChartPM10',
    parameter: 'pm10',
    index: [[0, 50], [50, 150], [150, 350], [350, 420], [420, 500], [500, 600]]
  },
  {
    sensorName: 'ChartSO2',
    parameter: 'so2',
    index: [[0, 80] ,[80, 365], [365, 800], [800, 1600], [1600, 2100], [2100, 2620]]
  },
  {
    sensorName: 'ChartCO',
    parameter: 'co',
    index: [[0, 5.0], [5.0, 10.0], [10.0, 17.0], [17.0, 34.0], [34.0, 46.0], [46.0, 57.5]]
  },
  {
    sensorName: 'ChartO3',
    parameter: 'o3',
    index: [[0, 118], [118, 157], [157, 235], [235, 785], [785, 980], [980, 1180]]
  },
  {
    sensorName: 'ChartNO2',
    parameter: 'no2',
    index: [[0, 0], [0, 0], [0, 0], [1130, 2260], [2260, 3000], [3000, 3750]]
  },
];
var stations = [
  {
    stationName: 'North',
    location: 'North Singapore',
    coordinates: {
      latitude: 1.42976,
      longitude: 103.79583
    }
  },
  {
    stationName: 'South',
    location: 'South Singapore',
    coordinates: {
      latitude: 1.29620,
      longitude: 103.84611
    }
  },
  {
    stationName: 'East',
    location: 'East Singapore',
    coordinates: {
      latitude: 1.36430, 
      longitude: 103.94814
    }
  },
  {
    stationName: 'West',
    location: 'West Singapore',
    coordinates: {
      latitude: 1.38861,
      longitude: 103.69934,
    }
  },
  {
    stationName: 'Central',
    location: 'Central Singapore',
    coordinates: {
      latitude: 1.36680,
      longitude: 103.79973,
    }
  }
];

