'use strict';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import lodash from 'lodash';
import async from 'async';
import Papa from 'babyparse';
import uniqBy from 'lodash.uniqBy'
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const _ = lodash;
export const name = 'eea-direct';

export function fetchData (source, callback) {
  // make requests for parallel
  async.waterfall([
    (cb) => {
      request.get({
        url: 'http://discomap.eea.europa.eu/map/fme/metadata/PanEuropean_metadata.csv'
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          cb('Could not gather current metadata, will generate records without coordinates.', null);
        }
        const data = getCoordinates(body, source.country);
        cb(null, data);
      });
    },
    (data, cb) => {
      const requestTasks = makeRequests(source, data);
      async.parallel(
        requestTasks,
        (err, res) => {
          if (err) {
            cb(null, []);
          }
          const finMeasurements = [].concat.apply([], res);
          cb(null, finMeasurements);
        });
    }], (err, res) => {
    if (err) {
      return callback(null, []);
    }
    return callback(null, {name: 'unused', measurements: res});
  });
}
// get the metadata, then reduce it.
const getCoordinates = (metadata, country) => {
  metadata = Papa.parse(metadata).data.slice(1, -1).filter((record) => {
    return record[0] === country;
  }).map((validRecord) => {
    return {
      stationId: validRecord[5],
      coordinates: {
        latitude: validRecord[14],
        longitude: validRecord[15]
      }
    };
  });
  return uniqBy(metadata, 'stationId');
};

// after that, do async parallel where we make all the data.
const makeRequests = (source, coordinates) => {
  // const pollutantRequests = ['CO', 'NO2', 'O3', 'PM2.5', 'PM10', 'SO2'].map((pollutant) => {
  return ['CO', 'NO2'].map((pollutant) => {
    return (done) => {
      const url = source.url.replace('<pollutant>', pollutant);
      request.get({
        url: url
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        const measurements = formatData(body, coordinates, source);
        return done(null, measurements);
      });
    };
  });
};

const formatData = (data, coordinates, source) => {
  // coordinates match AirQualityStationEolCode from meta with station_code data[11] and meta[6]
  // parametner is data[data.length -1]
  // value is data[20]
  // time is data[16]
  // averaging period is data[16-17]
  // attribution is EEA
  data = Papa.parse(data).data;
  data = data.map((record) => {
    return {
      parameter: record[5],
      date: record[16],
      coordinates: makeCoordinates(coordinates, record[11]),
      value: record[20],
      unit: record[record.length - 1],
      attribution: [{
        name: 'EEA',
        url: source.sourceUrl
      }],
      averagingPeriod: {
        unit: 'hours',
        value: makeAvgPeriod(record.slice(15, 17))
      }
    };
  });
  console.log(data);
  return data;
};

const makeCoordinates = (coordinatesList, stationId) => {
  return coordinatesList.filter((coordinates) => {
    return coordinates.stationId === stationId;
  }).map((validCoordinates) => {
    return {
      latitude: validCoordinates.latitude,
      longitude: validCoordinates.longitude
    };
  })[0];
};

const makeAvgPeriod = (delta) => {
  return moment(delta[0]).diff(delta[1], 'hours').toString();
};
