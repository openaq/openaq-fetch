'use strict';

import { acceptableParameters, convertUnits } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { parallel, map } from 'async';
import { uniqBy } from 'lodash';
import { default as parse } from 'csv-parse/lib/sync';
import tzlookup from 'tz-lookup';
import bboxPolygon from '@turf/bbox-polygon';
import inside from '@turf/inside';
import { point } from '@turf/helpers';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const stationsLink = 'http://battuta.s3.amazonaws.com/eea-stations.json';

export const name = 'eea-direct';

export function fetchData (source, cb) {
  const metadataRequest = makeMetadataRequest(source);
  const requestTasks = makeTaskRequests(source);
  parallel(
    [metadataRequest, requestTasks],
    (err, res) => {
      if (err) {
        return cb('Error getting data from source', []);
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
        return done('Could not gather current metadata, will generate records without coordinates.', []);
      }
      let data;
      try {
        data = parse(body, {delimiter: '\t'});
      } catch (e) {
        return done('Could not parse metadata file', []);
      }
      getCoordinates(data, source.country, cb);
    });
  };
};

// reduce metadata to list of objects with coordinates for
const getCoordinates = (metadata, country, callback) => {
  // filter for only country of interest's records
  metadata = metadata.filter((record) => {
    return record[0] === country;
  });
  map(metadata, (record, done) => {
    const lat = Number(record[15]);
    const lon = Number(record[14]);
    const station = {
      stationId: record[5],
      coordinates: {
        latitude: lat,
        longitude: lon
      },
      tz: tzlookup(lat, lon)
    };
    done(null, station);
  }, (err, mappedRecords) => {
    if (err) {
      return callback(null, []);
    }
    callback(null, uniqBy(mappedRecords, 'stationId'));
  });
};

// makes requests to get country's pollutant data.
const makeTaskRequests = (source) => {
  const pollutantRequests = acceptableParameters.map((pollutant) => {
    pollutant = pollutant.toUpperCase();
    return (done) => {
      const url = source.url + source.country + '_' + pollutant + '.csv';
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
        const tz = getTZ(coordinates, record[11]);
        let measurement = {
          coordinates: makeCoordinates(coordinates, record[11]),
          parameter: record[5].toLowerCase(),
          date: makeDate(record[16], tz),
          value: Number(record[19]),
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
        try {
          locations = JSON.parse(locations);
        } catch (e) {
          return done('Could not parse stations file', []);
        }
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
            // if failed spatial selection, return original coords
            if (!(geocodedProps)) {
              return cb(null, crds);
            }
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
      if (station.location) {
        measurement['location'] = station.location;
      }
      if (station.city) {
        measurement['city'] = station.city;
      }
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

const getTZ = (coordinatesList, stationId) => {
  return coordinatesList.find((coordinates) => {
    return coordinates.stationId === stationId;
  }).tz;
};

const makeDate = (date, tz) => {
  date = date.match(/\+/) ? date.split(/\+/)[0] : date.split(/-/)[0];
  date = moment.tz(date, 'YYYY-MM-DD HH:mm:ss', tz);
  return {
    utc: date.toDate(),
    local: date.format()
  };
};
