'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as parse } from 'csv-parse/lib/sync';
import { filter, map, mapSeries, parallel } from 'async';
import { flatten, includes } from 'lodash';
import { readFile, writeFile } from 'fs';
import uniqBy from 'lodash.uniqby';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const apiKey = 'mapzen-7Cgn6Fw';

const getCities = (source, cb) => {
  // get metadata records and station ids from current eea-country-locations file
  parallel([
    (done) => {
      request.get({
        url: 'http://discomap.eea.europa.eu/map/fme/metadata/PanEuropean_metadata.csv'
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return (null);
        }
        // grab rows for select country
        const data = parse(body, {delimiter: '\t'}).filter((row) => {
          return row[0] === source.country;
        });
        done(null, data);
      });
    },
    (done) => {
      readFile(source.locations, (err, data) => {
        if (err) {
          done(null, []);
        }
        map(JSON.parse(data.toString()), (station, cb) => {
          cb(null, station.stationId);
        }, (err, stationIDs) => {
          if (err) {
            done(null, []);
          }
          done(null, stationIDs, source.location);
        });
      });
    }
  ], (err, stationData) => {
    if (err) {
      cb(null, null);
    }
    // filter metadata to only records that don't exist in our current records.
    filter(stationData[0], (record, done) => {
      done(null, includes(stationData[1], record[5]));
    }, (err, newStations) => {
      // do nothing if there is nothing new
      if (err || newStations.length === 0) {
        console.log('no new stations');
        cb(null, null);
      }
      // make new station json
      getStations(newStations, (err, stations) => {
        if (err) {
          return (null);
        }
        // add city bounds, city names, and regions
        reverseGeocodeStations(stations, (err, stations) => {
          if (err) {
            return cb(null, []);
          }
          // callback a combo of old and new stations
          cb(null, stations.concat.apply(stationData[1]));
        });
      });
    });
  });
};

const getStations = (countryMetadata, cb) => {
  // transform station rows into objects
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
      return cb(null, []);
    }
    cb(null, uniqBy(mappedRecords, 'stationId'));
  });
};

const reverseGeocodeStations = (stations, cb) => {
  // reverse geocode each record made in getStations
  mapSeries(stations, (s, done) => {
    const lat = s.coordinates.latitude;
    const lon = s.coordinates.longitude;
    const geocodeURL = `https://search.mapzen.com/v1/reverse?api_key=${apiKey}&point.lat=${lat}&point.lon=${lon}&layers=locality,localadmin,neighbourhood,county`;
    setTimeout(() => {
      request.get({
        url: geocodeURL
      }, (err, res, geoJSON) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        geoJSON = JSON.parse(geoJSON);
        // init the new props as just the stationId.
        // this way if nothing was returned from pelias the stationId
        // needed for the login in the eea-direct adapter still exists
        // and the adapter won't break
        let geocodeProps = s.stationId;
        if (geoJSON.features[0]) {
          geocodeProps = getNewVals(geoJSON.features[0]);
          geocodeProps = Object.assign(geocodeProps, s);
        }
        return done(null, [geocodeProps]);
      });
    }, 2000);
  }, (err, reverseGeocodedStations) => {
    if (err) {
      return cb(null, []);
    }
    cb(null, flatten(reverseGeocodedStations));
  });
};

getCities((err, stations, stationFile) => {
  if (err) {
    console.log('err');
  }
  writeFile(stationFile, stations, (err) => {
    if (err) {
      console.log(err);
    }
    console.log('New stations added');
  });
});

const getNewVals = (geoJSON) => {
  // these if statements first try to pull the most specific equivalent
  // for city or location. If that doesn not exist, the next most generalized
  // is selected
  let location, region, bounds;
  const properties = geoJSON.properties;
  // get location
  if (properties.locality) {
    location = properties.locality;
  } else if (properties.localadmin) {
    location = properties.localadmin;
  } else if (properties.neighbourhood) {
    location = properties.neighbourhood;
  } else if (properties.county) {
    location = properties.county;
  } else {
    location = 'unused';
  }
  // get city
  if (properties.region) {
    region = properties.region;
  } else if (properties.macroregion) {
    region = properties.macroregion;
  } else if (properties.macrocounty) {
    region = properties.macrocounty;
  } else {
    region = 'unused';
  }
  // get bounds
  if (geoJSON.bbox) {
    bounds = geoJSON.bbox;
  } else {
    bounds = 'unused';
  }

  return {
    location: location,
    city: region,
    bounds: bounds
  };
};
