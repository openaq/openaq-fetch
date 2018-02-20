/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the China National Environmental Monitoring Centre
 * data sources.
 *
 * This adapter depends on https://github.com/openaq/lambda-chinaaqidata updating
 * source data.
 */
'use strict';

import { default as moment } from 'moment-timezone';
import { convertUnits } from '../lib/utils';
import { S3 } from 'aws-sdk';

// The S3 bucket containing the data is in a different region
const s3 = new S3({region: 'ap-northeast-2'});

exports.name = 'chinaaqidata';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  const params = {
    Bucket: 'openaq-chinaaqidata',
    Key: 'airnow.json'
  };
  s3.getObject(params, (err, response) => {
    if (err) {
      return cb({message: 'Failure to load data from S3.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      response = JSON.parse(response.Body);
      const data = formatData(response);

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
 * @param {object} data Fetched source data
 * @return {object} Parsed and standarized data our system can use
 */
var formatData = function (data) {
  let measurements = [];

  // Create the base object
  const base = {
    attribution: [
      {'name': 'China National Environmental Monitoring Centre', 'url': 'http://www.cnemc.cn/'},
      {'name': 'An Interactive Web Mapping Visualization of Urban Air Quality Monitoring Data of China', 'url': 'http://www.mdpi.com/2073-4433/8/8/148/htm'}
    ],
    averagingPeriod: {'value': 1, 'unit': 'hours'}
  };

  // Loop over each location
  data.features.forEach((l) => {
    // Start with the base
    let m = Object.assign({}, base);

    // Add coordinates
    m.coordinates = {
      longitude: l.geometry.coordinates[0],
      latitude: l.geometry.coordinates[1]
    };

    // City/area + name
    m.city = l.properties.area;
    m.location = l.properties.positionname;

    // Datetime
    const date = moment.tz(l.properties.timepoint, 'YYYY-MM-DDTHH:mm:ss', 'Asia/Shanghai');
    m.date = {
      utc: date.toDate(),
      local: date.format()
    };

    // PM25
    measurements.push(Object.assign({
      parameter: 'pm25',
      unit: 'µg/m³',
      value: Number(l.properties['pm2_5'])
    }, m));

    // CO
    measurements.push(Object.assign({
      parameter: 'co',
      unit: 'mg/m³',
      value: Number(l.properties['co'])
    }, m));

    // NO2
    measurements.push(Object.assign({
      parameter: 'no2',
      unit: 'µg/m³',
      value: Number(l.properties['no2'])
    }, m));

    // O3
    measurements.push(Object.assign({
      parameter: 'o3',
      unit: 'µg/m³',
      value: Number(l.properties['o3'])
    }, m));

    // PM10
    measurements.push(Object.assign({
      parameter: 'pm10',
      unit: 'µg/m³',
      value: Number(l.properties['pm10'])
    }, m));

    // SO2
    measurements.push(Object.assign({
      parameter: 'so2',
      unit: 'µg/m³',
      value: Number(l.properties['so2'])
    }, m));
  });

  // Be kind, convert
  measurements = convertUnits(measurements);

  return {
    name: 'unused',
    measurements: measurements
  };
};
