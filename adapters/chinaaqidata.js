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
import JSONStream from 'JSONStream';
import { DataStream } from 'scramjet';

// The S3 bucket containing the data is in a different region
const s3 = new S3({region: 'ap-northeast-2'});

exports.name = 'chinaaqidata';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchStream = function (source) {
  const params = {
    Bucket: 'openaq-chinaaqidata',
    Key: 'airnow.json'
  };

  const s3stream = s3.getObject(params).createReadStream();
  return DataStream
    .pipeline(
      s3stream,
      JSONStream.parse('features.*')
    )
    .catch(e => {
      s3stream.abort();
      e.stream.end();
      throw e;
    })
    .use(stream => {
      stream.name = 'unused';
      return stream;
    })
    .map(extractMeasurements)
    .map(convertUnits)
    .flatten()
  ;
};

// Create the base object
const base = {
  attribution: [
    {'name': 'China National Environmental Monitoring Centre', 'url': 'http://www.cnemc.cn/'},
    {'name': 'An Interactive Web Mapping Visualization of Urban Air Quality Monitoring Data of China', 'url': 'http://www.mdpi.com/2073-4433/8/8/148/htm'}
  ],
  averagingPeriod: {'value': 1, 'unit': 'hours'}
};

const extractMeasurements = features => {
  // Start with the base
  let m = Object.assign({}, base);

  // Add coordinates
  m.coordinates = {
    longitude: features.geometry.coordinates[0],
    latitude: features.geometry.coordinates[1]
  };

  // City/area + name
  m.city = features.properties.area;
  m.location = features.properties.positionname;

  // Datetime
  const date = moment.tz(features.properties.timepoint, 'YYYY-MM-DDTHH:mm:ss', 'Asia/Shanghai');
  m.date = {
    utc: date.toDate(),
    local: date.format()
  };

  return [
    // PM 2.5
    Object.assign({
      parameter: 'pm25',
      unit: 'µg/m³',
      value: Number(features.properties['pm2_5'])
    }, m),

    // CO
    Object.assign({
      parameter: 'co',
      unit: 'mg/m³',
      value: Number(features.properties['co'])
    }, m),

    // NO2
    Object.assign({
      parameter: 'no2',
      unit: 'µg/m³',
      value: Number(features.properties['no2'])
    }, m),

    // O3
    Object.assign({
      parameter: 'o3',
      unit: 'µg/m³',
      value: Number(features.properties['o3'])
    }, m),

    // PM10
    Object.assign({
      parameter: 'pm10',
      unit: 'µg/m³',
      value: Number(features.properties['pm10'])
    }, m),

    // SO2
    Object.assign({
      parameter: 'so2',
      unit: 'µg/m³',
      value: Number(features.properties['so2'])
    }, m)
  ];
};
