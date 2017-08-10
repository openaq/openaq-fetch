'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as parse } from 'csv-parse/lib/sync';
import { map, mapSeries } from 'async';
import { flatten } from 'lodash';
import { writeFile } from 'fs';
import uniqBy from 'lodash.uniqby';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const apiKey = 'mapzen-7Cgn6Fw';
const getCities = (cb) => {
  request.get({
    url: 'http://discomap.eea.europa.eu/map/fme/metadata/PanEuropean_metadata.csv'
  }, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb(null);
    }
    const data = parse(body, {delimiter: '\t'});
    getStations(data, (err, stations) => {
      if (err) {
        return cb(null);
      }
      reverseGeocodeStations(stations, (err, stations) => {
        if (err) {
          return cb(null, []);
        }
        cb(null, stations);
      });
    });
  });
};

const getStations = (countryMetadata, cb) => {
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
        let geocodeProps = s.stationId;
        if (geoJSON.features[0]) {
          geocodeProps = getNewVals(geoJSON.features[0]);
          geocodeProps = Object.assign(geocodeProps, {stationId: s['stationId']});
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

getCities((err, res) => {
  if (err) {
    console.log('err');
  }
  writeFile('data_scripts/eea-stations.json', JSON.stringify(res), (err) => {
    if (err) { console.log('could not write file'); }
    console.log('done');
  });
});

const getNewVals = (geoJSON) => {
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
