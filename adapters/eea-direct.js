'use strict';
import { acceptableParameters, convertUnits } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { parallel, map, filter } from 'async';
import { default as parse } from 'csv-parse/lib/sync';
import uniqBy from 'lodash.uniqby';
import { intersection } from 'lodash';
import geocoder from 'geocoder';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
export const name = 'eea-direct';


export function fetchData (source, cb) {
  const metadataRequest = makeMetadataRequest(source);
  const requestTasks = makeTaskRequests(source);
  parallel(
    [metadataRequest, requestTasks],
    (err, res) => {
      if (err) {
        return cb(null, []);
      }
      try {
        formatData(res, source, cb);
      } catch (e) {
        cb({message: 'Error parsing the data'}, null);
      }
    });
}

// makes request used to get then format metadata for station coordinates
const makeMetadataRequest = (source) => {
  return (cb) => {
    request.get({
      url: 'http://discomap.eea.europa.eu/map/fme/metadata/PanEuropean_metadata.csv'
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return cb('Could not gather current metadata, will generate records without coordinates.', []);
      }
      const data = parse(body, {delimiter: '\t'});
      getCoordinates(data, source.country, cb);
    });
  };
};

// reduce metadata to list of objects with coordinates for
const getCoordinates = (metadata, country, callback) => {
  // filter for only country of interest's records
  filter(metadata, (record, truth) => {
    truth(record[0] === country);
  }, (countryMetadata) => {
    // map filtered records to be a list of objs w stationId/coordinates
    map(countryMetadata, (record, done) => {
      const station = {
        stationId: record[5],
        coordinates: {
          latitude: parseFloat(record[15]),
          longitude: parseFloat(record[14])
        }
      };
      done(null, station);
    }, (err, mappedRecords) => {
      if (err) {
        return callback(null, []);
      }
      callback(null, uniqBy(mappedRecords, 'stationId'));
    });
  });
};

// makes requests to get country's pollutant data.
const makeTaskRequests = (source) => {
  const pollutantRequests = acceptableParameters.map((pollutant) => {
    pollutant = pollutant.toUpperCase();
    return (done) => {
      const url = source.url.replace('<pollutant>', pollutant);
      request.get({
        url: url
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        done(null, parse(body).slice(1, -1));
      });
    };
  });
  return (done) => {
    parallel(
      pollutantRequests,
      (err, response) => {
        if (err) {
          done(null, []);
        }
        done(null, [].concat.apply([], response));
      }
    );
  };
};

// formats data to match openAQ standard
const formatData = (data, source, cb) => {
  const coordinates = data[0];
  const records = data[1];
  map(records, (record, cb) => {
    const crds = makeCoordinates(coordinates, record[11]);
    parallel([
      (done) => {
        let measurement = {
          location: '',
          city: '',
          parameter: record[5].toLowerCase(),
          date: makeDate(record[16], record[4]),
          coordinates: crds,
          value: parseInt(record[19]),
          unit: record[record.length - 1],
          attribution: [{
            name: 'EEA',
            url: source.sourceUrl
          }],
          averagingPeriod: {
            unit: 'hours',
            value: 1
          }
        };
        // apply unit conversion to generated record
        done(null, convertUnits([measurement])[0]);
      },
      (done) => {
        geocoder.reverseGeocode(crds.latitude, crds.longitude, (err, data) => {
          if (err) {
            return done(null, null);
          }
          let city = data.results.filter((geocodeObj) => {
            if (geocodeObj.types) {
              // strings in first list denote city in gc response
              const hasCorrectType = intersection(['administrative_area_level_1', 'locality'], geocodeObj.types);
              return hasCorrectType.length > 0;
            }
          });
          if (city.length > 0) {
            const longCityName = city[0].address_components[0].long_name;
            return done(null, longCityName);
          }
        });
      }
    ], cb
    );
  }, (err, records) => {
    if (err) {
      return cb(null, []);
    }
    const measurements = records.map((record) => {
      const measurement = record[0];
      if (record[1] !== null) {
        measurement['city'] = record[1];
      }
      return measurement;
    });
    cb(null, {name: 'unused', measurements: measurements});
  });
};

const makeCoordinates = (coordinatesList, stationId) => {
  return coordinatesList.find((coordinates) => {
    return coordinates.stationId === stationId;
  }).coordinates;
};

const makeDate = (date, timeZone) => {
  timeZone = timeZone.split('timezone/')[1];
  date = date.split('+')[0];
  switch (timeZone) {
    case 'UTC':
      timeZone = 'Atlantic/Azores';
      date = date + '+00:00';
      break;
    case 'UTC+01':
      timeZone = 'Europe/Lisbon';
      date = date + '+01:00';
      break;
    case 'UTC+02':
      timeZone = 'Europe/Madrid';
      date = date + '+02:00';
      break;
    case 'UTC+03':
      timeZone = 'Europe/Helsinki';
      date = date + '+03:00';
      break;
    case 'UTC+04':
      timeZone = 'Asia/Tbilisi';
      date = date + '+04:00';
      break;
    case 'UTC-04':
      timeZone = 'America/New_York';
      date = date + '-04:00';
      break;
    case 'UTC-03':
      timeZone = 'Atlantic/Bermuda';
      date = date + '-03:00';
      break;
    default:
      break;
  }
  date = moment.tz(date, 'YYYY-MM-DD hh:mm:ss', timeZone);
  if ('UTC') {
    return {
      utc: date.toDate(),
      // need to manually add back the UTC offset per rules for formatting local.
      local: date.format().split('Z')[0] + '+00:00'
    };
  }
  return {
    utc: date.toDate(),
    local: date.format()
  };
};
