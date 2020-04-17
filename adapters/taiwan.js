/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Taiwanese data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { parallel } from 'async';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'taiwan';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  // Fetching both the main data page as well as a page to get all
  // coordinates for locations
  parallel({
    sources: (done) => {
      const url = `${source.url}/355000000I-000259?format=json&token=${process.env.TW_EPA_TOKEN}`;
      request(url, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done({message: 'Failure to load data url'});
        }

        return done(null, body);
      });
    },
    coordinates: (done) => {
      // This url seems to have a list of all locations
      request(`${source.url}/355000000I-000006?format=json&token=${process.env.TW_EPA_TOKEN}`, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done({message: 'Failure to load coordinates url'});
        }

        return done(null, body);
      });
    }
  }, (err, results) => {
    if (err) {
      return cb(err);
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(results);

      // Make sure the data is valid
      if (data === undefined) {
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
 * @param {object} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
const formatData = function (data) {
  // Parse the JSON and grab records
  const sites = JSON.parse(data.coordinates).result.records;
  const records = JSON.parse(data.sources).result.records;

  /**
   * Given a json object, convert to aq openaq format
   * @param {json object} item coming from source data
   * @return {object} a repacked object
   */
  const aqRepack = (item) => {
    // Find the associated metadata by looking for location/county in address
    let locationMetadata;
    for (let i = 0; i < sites.length; i++) {
      const m = sites[i];
      if (m.SiteName === item.SiteName) {
        locationMetadata = m;
        break;
      }
    }

    // Exit if we have no metadata
    if (!locationMetadata) {
      return;
    }

    const dateMoment = moment.tz(item.PublishTime, 'YYYY-MM-DD HH:mm', 'Asia/Taipei');
    const base = {
      date: {
        utc: dateMoment.toDate(),
        local: dateMoment.format()
      },
      location: locationMetadata.SiteEngName,
      city: locationMetadata.County,
      coordinates: {
        latitude: Number(locationMetadata.TWD97Lat),
        longitude: Number(locationMetadata.TWD97Lon)
      },
      attribution: [{name: 'http://opendata.epa.gov.tw/', url: 'https://opendata.epa.gov.tw/webapi/api/rest/datastore/355000000I-000259?format=json&token={TOKEN}'}, {name: 'Environmental Protection Administration, Executive Yuan, R.O.C. (Taiwan)', url: 'http://taqm.epa.gov.tw/taqm/en/'}],
      averagingPeriod: {unit: 'hours', value: 1}
    };

    // Break out individual measurements below, units come from looking
    // at webpage

    // PM25
    if (!isNaN(item['PM2.5']) && item['PM2.5'] !== '') {
      let pm25 = Object.assign({}, base);
      pm25.parameter = 'pm25';
      pm25.value = Number(item['PM2.5']);
      pm25.unit = 'µg/m³';
      measurements.push(pm25);
    }

    // PM10
    if (!isNaN(item['PM10']) && item['PM10'] !== '') {
      let pm10 = Object.assign({}, base);
      pm10.parameter = 'pm10';
      pm10.value = Number(item['PM10']);
      pm10.unit = 'µg/m³';
      measurements.push(pm10);
    }

    // O3
    if (!isNaN(item['O3']) && item['O3'] !== '') {
      let o3 = Object.assign({}, base);
      o3.parameter = 'o3';
      o3.value = Number(item['O3']);
      o3.unit = 'ppb';
      measurements.push(o3);
    }

    // SO2
    if (!isNaN(item['SO2']) && item['SO2'] !== '') {
      let so2 = Object.assign({}, base);
      so2.parameter = 'so2';
      so2.value = Number(item['SO2']);
      so2.unit = 'ppb';
      measurements.push(so2);
    }

    // CO
    if (!isNaN(item['CO']) && item['CO'] !== '') {
      let co = Object.assign({}, base);
      co.parameter = 'co';
      co.value = Number(item['CO']);
      co.unit = 'ppm';
      measurements.push(co);
    }

    // NO2
    if (!isNaN(item['NO2']) && item['NO2'] !== '') {
      let no2 = Object.assign({}, base);
      no2.parameter = 'no2';
      no2.value = Number(item['NO2']);
      no2.unit = 'ppb';
      measurements.push(no2);
    }
  };

  let measurements = [];
  records.forEach(aqRepack);
  measurements = convertUnits(measurements);
  return {name: 'unused', measurements: measurements};
};
