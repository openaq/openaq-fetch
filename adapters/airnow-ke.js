'use strict';

import { find } from 'lodash';
import { default as moment } from 'moment-timezone';
import { convertUnits, acceptableParameters } from '../lib/utils';
import { parallel } from 'async';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'airnow-ke';

exports.fetchData = function (source, cb) {
  // Fetch locations and latest measurements in parallel
  parallel({
    stations: (done) => {
      const url = `${source.url}airnow/today/monitoring_site_locations.dat`;
      return request(url, (err, res, body) => {
        return done(err, body);
      });
    },
    measurements: (done) => {
      // Filename should be the current time in UTC like '2016030616' and then
      // get the previous hours measurements
      const dateString = moment.utc().subtract(1, 'hours').format('YYYYMMDDHH');
      const url = `${source.url}airnow/today/HourlyData_${dateString}.dat`;
      return request(url, (err, res, body) => {
        return done(err, body);
      });
    }
  }, (err, results) => {
    if (err) {
      return cb({message: 'Failure to load data urls.'});
    }

    // Format the data
    try {
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

// Loop over measurements, adding station data and saving to database.
const formatData = (results) => {
  const getDate = (day, time, offset) => {
    // Grab date from page, add time string and convert to date
    const dateString = `${day} ${time}`;

    // A bit odd looking here based on what we're getting in the files
    const utc = moment.utc(dateString, 'MM/DD/YYYY HH:mm');
    const local = moment.utc(dateString, 'MM/DD/YYYY HH:mm').utcOffset(offset);

    return {utc: utc.toDate(), local: local.format()};
  };

  // Helper to convert city name
  const convertCity = function (city) {
    if (!city) {
      return;
    }

    return city.split(',')[0].trim();
  };

  // Fancy up the locations object
  results.stations = results.stations.split('\n');
  results.stations = results.stations.map((s) => {
    s = s.split('|');
    return {
      aqsid: s[0],
      coordinates: {
        latitude: Number(s[8]),
        longitude: Number(s[9])
      },
      country: s[12],
      city: convertCity(s[16]) || s[20]
    };
  });

  // Special bit to account for Kenyan data being shared differently
  // TODO: Fix this hopefully at the source?
  results.stations = results.stations.map((s) => {
    if (s.aqsid.slice(0, 3) === 'NRB') {
      s.country = 'KE';
      s.city = 'Nairobi';
    }

    return s;
  });

  // Fancy up the measurements object
  results.measurements = results.measurements.split('\n');

  // Filter out measurements that don't have a matching station
  results.measurements = results.measurements.filter((m) => {
    m = m.split('|');
    return find(results.stations, {aqsid: m[2]});
  });

  // Generate measurement object
  results.measurements = results.measurements.map((m) => {
    m = m.split('|');
    let parameter = m[5].toLowerCase().replace('.', '');
    const station = find(results.stations, {aqsid: m[2]});
    return {
      coordinates: station.coordinates,
      city: station.city,
      country: station.country,
      location: m[3].trim(),
      date: getDate(m[0], m[1], Number(m[4])),
      parameter: (parameter === 'ozone') ? 'o3' : parameter,
      unit: m[6],
      value: Number(m[7]),
      attribution: [{name: 'US EPA AirNow', url: 'http://www.airnow.gov/'}, {name: m[8].trim()}],
      averagingPeriod: {unit: 'hours', value: 1}
    };
  });

  // We only need Kenya data for now
  results.measurements = results.measurements.filter((m) => {
    return m.country === 'KE';
  });

  // Filter out unwanted measurements
  results.measurements = results.measurements.filter((m) => {
    return acceptableParameters.includes(m.parameter);
  });

  // Final quality check, get rid of bad city and countries
  results.measurements = results.measurements.filter((m) => {
    return (m.city && m.city !== 'N/A' && m.country && m.country.trim() !== '');
  });

  // Convert units to platform standard
  results.measurements = convertUnits(results.measurements);

  // Ship it off to be saved!
  return {name: 'unused', measurements: results.measurements};
};
