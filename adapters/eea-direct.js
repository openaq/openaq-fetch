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
        cb(null, getCoordinates(body, source.country));
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
          cb(null, [].concat.apply([], res));
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
  (done) => {
    Papa.parse(metadata, {
      step: (record, parser) => {
        record.filter((record) => {
          return record[0] === country;
        }).map((record) => {
          return {
            stationId: record[5],
            coordinates: {
              latitude: record[14],
              longitude: record[15]
            }
          };
        });
      },
      success: (records, parser) => {
        done(null, uniqBy(records, 'stationId'));
      }
    });
  };
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
        done(null, formatData(body, coordinates, source));
      });
    };
  });
};

const formatData = (data, coordinates, source) => {
  (cb) => {
    Papa.parse(data, {
      step: (record, parser) => {
        record = record.data;
        return {
          parameter: record[5],
          date: record[16],
          coordinates: makeCoordinates(coordinates, record[11]),
          value: record[record.length - 1] === 'mg/m3' ? record[19] * 1000 : record[19],
          unit: record[record.length - 1] === 'mg/m3' ? 'ug/m3' : record[record.length - 1],
          attribution: [{
            name: 'EEA',
            url: source.sourceUrl
          }],
          averagingPeriod: {
            unit: 'hours',
            value: makeAvgPeriod(record.slice(15, 17))
          }
        };
      },
      complete: (records, parser) => {
        cb(null, records);
      }
    });
  };
};

const makeCoordinates = (coordinatesList, stationId) => {
  return coordinatesList.filter((coordinates) => {
    return coordinates.stationId === stationId;
  }).map((station) => {
    return {
      latitude: station.coordinates.latitude,
      longitude: station.coordinates.longitude
    };
  })[0];
};

const makeAvgPeriod = (delta) => {
  // TODO: make timestaps 'not depreciated' in moment
  return moment(delta[1]).diff(delta[0], 'hours').toString();
};
