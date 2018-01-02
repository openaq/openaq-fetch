/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Hong Kong data source.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'hong-kong';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = (source, cb) => {
  request(`${source.url}/24pc_Eng.xml`, function (err, res, body) {
    if (err || res.statusCode !== 200) {}

    try {
      const data = formatData(body);

      if (data.length === 0) {
        return cb({message: 'Failure to parse data.'});
      }
      return cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} data Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
const formatData = function (data) {
  let measurements = [];
  let $ = cheerio.load(data, { xmlMode: true });
  const rootElement = $('AQHI24HrPollutantConcentration');
  // Gets the last build date for getting current measurements
  const lastBuildDate = moment.tz(rootElement.children('lastBuildDate').text(), 'ddd, D MMM YYYY HH:mm:ss Z', 'Asia/Hong_Kong');

  // Traverses the AQHI24HrPollutantConcentration > PollutantConcentration and
  // filters the measurements in lastBuildDate
  rootElement.children('PollutantConcentration').filter(function (index, element) {
    let dateMoment = moment.tz($(element).children('DateTime').text(), 'ddd, D MMM YYYY HH:mm:ss Z', 'Asia/Hong_Kong');
    return dateMoment.dayOfYear() === lastBuildDate.dayOfYear() && dateMoment.hour() === lastBuildDate.hour();
  }).each(function (i, element) {
    const obj = $(element);
    // Gets station name
    const stationName = obj.children('StationName').text();
    const dateMoment = moment.tz(obj.children('DateTime').text(), 'ddd, D MMM YYYY HH:mm:ss Z', 'Asia/Hong_Kong');
    const stationObj = hongKongLocations[stationName];
    // Create a based object
    const base = {
      location: stationName,
      city: stationObj.city,
      date: {
        utc: dateMoment.toDate(),
        local: dateMoment.format()
      },
      coordinates: stationObj.coordinates,
      attribution: [{name: 'Environmental Protection Department', url: 'https://data.gov.hk/en-data/dataset/hk-epd-airteam-past24hr-pc-of-individual-air-quality-monitoring-stations'}],
      averagingPeriod: {value: 1, unit: 'hours'}
    };

    // NO2
    if (obj.has('NO2') && obj.children('NO2').text() !== '' && obj.children('NO2').text() !== '-') {
      let no2 = Object.assign({
        parameter: 'no2',
        value: Number(obj.children('NO2').text()),
        unit: 'µg/m³'
      }, base);
      measurements.push(no2);
    }

    // O3
    if (obj.has('O3') && obj.children('O3').text() !== '' && obj.children('O3').text() !== '-') {
      let o3 = Object.assign({
        parameter: 'o3',
        value: Number(obj.children('O3').text()),
        unit: 'µg/m³'
      }, base);
      measurements.push(o3);
    }

    // SO2
    if (obj.has('SO2') && obj.children('SO2').text() !== '' && obj.children('SO2').text() !== '-') {
      let so2 = Object.assign({
        parameter: 'so2',
        value: Number(obj.children('SO2').text()),
        unit: 'µg/m³'
      }, base);
      measurements.push(so2);
    }

    // CO
    if (obj.has('CO') && obj.children('CO').text() !== '' && obj.children('CO').text() !== '-') {
      let co = Object.assign({
        parameter: 'co',
        value: Number(obj.children('CO').text()),
        unit: 'µg/m³'
      }, base);
      measurements.push(co);
    }

    // PM10
    if (obj.has('PM10') && obj.children('PM10').text() !== '' && obj.children('PM10').text() !== '-') {
      let pm10 = Object.assign({
        parameter: 'pm10',
        value: Number(obj.children('PM10').text()),
        unit: 'µg/m³'
      }, base);
      measurements.push(pm10);
    }

    // PM2.5
    // The name of element including dot, it should be escaped.
    if (obj.has('PM2\\.5') && obj.children('PM2\\.5').text() !== '' && obj.children('PM2\\.5').text() !== '-') {
      let pm25 = Object.assign({
        parameter: 'pm25',
        value: Number(obj.children('PM2\\.5').text()),
        unit: 'µg/m³'
      }, base);
      measurements.push(pm25);
    }
  });

  measurements = convertUnits(measurements);
  return {name: 'unused', measurements: measurements};
};

// The data is generated from https://github.com/ymhuang0808/hk-air-quality-stations/blob/master/index.js
const hongKongLocations = {
  Eastern: {city: 'Eastern', coordinates: {longitude: 114.21944444444445, latitude: 22.282777777777778}},
  'Tuen Mun': {city: 'N.T.', coordinates: {longitude: 113.97666666666667, latitude: 22.391111111111112}},
  'Tung Chung': {city: 'New Territories', coordinates: {longitude: 113.94361111111111, latitude: 22.28888888888889}},
  'Mong Kok': {city: 'Kowloon', coordinates: {longitude: 114.16833333333334, latitude: 22.322499999999998}},
  Central: {city: 'Central', coordinates: {longitude: 114.15805555555556, latitude: 22.281944444444445}},
  'Tap Mun': {city: 'Tap Mun Police Post', coordinates: {longitude: 114.36083333333333, latitude: 22.47138888888889}},
  'Causeway Bay': {city: 'Causeway Bay', coordinates: {longitude: 114.185, latitude: 22.279999999999998}},
  'Tseung Kwan O': {city: 'Sai Kung', coordinates: {longitude: 114.25944444444444, latitude: 22.317777777777778}},
  'Sham Shui Po': {city: 'Kowloon', coordinates: {longitude: 114.15916666666668, latitude: 22.330277777777777}},
  'Kwai Chung': {city: 'New Territories', coordinates: {longitude: 114.12972222222221, latitude: 22.357222222222223}},
  'Tai Po': {city: 'New Territories', coordinates: {longitude: 114.16444444444446, latitude: 22.450833333333332}},
  'Sha Tin': {city: 'New Territories', coordinates: {longitude: 114.18444444444445, latitude: 22.37638888888889}},
  'Yuen Long': {city: 'New Territories', coordinates: {longitude: 114.02277777777778, latitude: 22.44527777777778}},
  'Central/Western': {city: 'Central & Western', coordinates: {longitude: 114.14444444444445, latitude: 22.285}},
  'Kwun Tong': {city: 'Kowloon', coordinates: {longitude: 114.22472222222223, latitude: 22.313333333333333}},
  'Tsuen Wan': {city: 'New Territories', coordinates: {longitude: 114.11444444444444, latitude: 22.371666666666666}}
};
