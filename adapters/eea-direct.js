'use strict';
import { acceptableParameters, convertUnits } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { parallel, map, filter } from 'async';
import { default as parse } from 'csv-parse/lib/sync';
import uniqBy from 'lodash.uniqby';
import { bboxPolygon, inside, point } from 'turf';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const stationsLink = "https://raw.githubusercontent.com/openaq/battuta/develop/eea-stations.json"

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
  parallel([
    (done) => {
      map(records, (record, cb) => {
        let measurement = {
          coordinates: makeCoordinates(coordinates, record[11]),
          parameter: record[5].toLowerCase(),
          date: makeDate(record[16], record[4]),
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
        cb(null, convertUnits([measurement])[0]);
      }, (err, mappedRecords) => {
        if (err) {
          return done(null, []);
        }
        done(null, mappedRecords);
      });
    },
    (done) => {
      // read in location file, try to combine locations with coordinates
      // by matching stationId or a spatial join, then return successful combos
      // TODO: change this to fetch upon implementing new repo
      request.get({url: stationsLink}, (err, res, locations) => {
        if (err) {
          return done(null, []);
        }
        locations = JSON.parse(locations);
        map(coordinates, (crds, cb) => {
          if (err) {
            return cb(null, crds);
          }
          let geocodedProps = locations.find((location) => {
            // an object with city, region, bounds, and stationId
            // or just a stationId if reverse geocoding was unsuccessful
            if (location.stationId) {
              return location.stationId === crds.stationId;
            } else {
              return location === crds.stationId;
            }
          });
          // if new station, denoted by no matching id,
          // try to spatial join
          if (!(geocodedProps)) {
            geocodedProps = locations.find((location) => {
              if (location.stationId) {
                const bbox = bboxPolygon(location.bounds);
                const stationPoint = point(
                  crds.longitude,
                  crds.latitude
                );
                return inside(stationPoint, bbox);
              }
            });
          }
          if (geocodedProps) {
            geocodedProps = typeof geocodedProps === 'string' ? crds : Object.assign(geocodedProps, crds);
            cb(null, geocodedProps);
          }
        }, (err, updatedCoordinates) => {
          if (err) {
            return done(null, coordinates);
          }
          done(null, updatedCoordinates);
        });
      });
    }
  ], (err, mappedData) => {
    if (err) {
      return cb(err, []);
    }
    let measurements = mappedData[0];
    const coordinates = mappedData[1];
    // map coordinates and location names to measurements
    map(measurements, (measurement, done) => {
      let station = matchStation(coordinates, measurement['coordinates']);
      measurement['location'] = (station.location ? station.location : 'unused');
      measurement['city'] = (station.city ? station.city : 'unused');
      done(null, measurement);
    }, (err, finalMeasurements) => {
      if (err) {
        return cb(null, {name: 'unused', measurements: measurements});
      }
      cb(null, {name: 'unused', measurements: finalMeasurements});
    });
  });
};

const matchStation = (coordinates, measurementCoords) => {
  let station;
  if (coordinates.length > 0) {
    station = coordinates.find((crds) => {
      return crds.coordinates === measurementCoords;
    });
    return station;
  }
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
