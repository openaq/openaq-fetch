'use strict';

import { default as FTP } from 'ftp';
import byline from 'byline';
import { omit, merge, find, filter } from 'lodash';
import { default as moment } from 'moment-timezone';
import { convertUnits } from '../lib/utils';

export const name = 'airnow-ftp';

exports.fetchData = function (source, cb) {
  // A workaround to getting rate limited for 6 logins in 1 hr for AirNow
  // system. Only try to grab data in last 20 minutes of an hour.
  if (moment().minute() < 40) {
    return cb(null, {name: 'unused', measurements: []});
  }

  // First fetch the stations list and then get the latest measurements
  const file = 'Locations/monitoring_site_locations.dat';
  const lineToObj = function (line) {
    const convertCity = function (city) {
      if (!city) {
        return;
      }

      return city.split(',')[0].trim();
    };

    return {
      aqsid: line[0],
      coordinates: {
        latitude: Number(line[8]),
        longitude: Number(line[9])
      },
      country: line[12],
      city: convertCity(line[16]) || line[20]
    };
  };
  // Get the stations
  getObjects(source.url, file, lineToObj, (err, stations) => {
    if (err) {
      return cb({message: 'Failure to load ftp data.'});
    }

    const niceUnit = function (unit) {
      switch (unit) {
        case 'UG/M3':
          return 'µg/m³';
        default:
          return unit.toLowerCase();
      }
    };

    const niceParameter = function (parameter) {
      switch (parameter) {
        case 'OZONE':
          return 'o3';
        case 'PM2.5':
          return 'pm25';
        default:
          return parameter.toLowerCase();
      }
    };

    // Get the measurements
    // Filename should be the current time in UTC like '2016030616' and then
    // get the previous hours measurements
    const dateString = moment.utc().subtract(1, 'hours').format('YYYYMMDDHH');
    const file = `HourlyData/${dateString}.dat`;
    const lineToObj = function (line) {
      return {
        aqsid: line[2],
        day: line[0],
        hour: line[1],
        location: line[3].trim(),
        timezoneOffset: Number(line[4]),
        parameter: niceParameter(line[5]),
        unit: niceUnit(line[6]),
        value: Number(line[7]),
        attribution: [{name: 'US EPA AirNow', url: 'http://www.airnow.gov/'}, {name: line[8].trim()}],
        averagingPeriod: {unit: 'hours', value: 1}
      };
    };
    getObjects(source.url, file, lineToObj, (err, measurements) => {
      if (err) {
        return cb({message: 'Failure to load ftp data.'});
      }

      // Filter out parameters we do not want
      measurements = filter(measurements, (m) => {
        const accepted = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co', 'bc'];
        return accepted.indexOf(m.parameter) !== -1;
      });

      // Format the data and send it back
      const data = formatData(stations, measurements);
      cb(null, data);
    });
  });
};

const getObjects = function (url, file, lineToObj, cb) {
  const ftp = new FTP();
  ftp.on('ready', () => {
    ftp.get(file, (err, stream) => {
      if (err) {
        return cb(err);
      }
      let objects = [];
      const lines = byline.createStream(stream, { encoding: 'utf8' });
      stream.once('close', function () {
        ftp.end();
        cb(null, objects);
      });
      lines.on('data', function (line) {
        line = line.split('|');
        objects.push(lineToObj(line));
      });
    });
  });
  ftp.on('error', (e) => {
    cb(e);
  });
  ftp.connect({host: url, user: process.env.AIRNOW_FTP_USER, password: process.env.AIRNOW_FTP_PASSWORD});
};

// Loop over measurements, adding station data and saving to database.
const formatData = (stations, measurements) => {
  const getDate = (day, time, offset) => {
    // Grab date from page, add time string and convert to date
    const dateString = `${day} ${time}`;

    // A bit odd looking here based on what we're getting in the files
    const utc = moment.utc(dateString, 'MM/DD/YYYY HH:mm');
    const local = moment.utc(dateString, 'MM/DD/YYYY HH:mm').utcOffset(offset);

    return {utc: utc.toDate(), local: local.format()};
  };

  // Make the measurement object
  measurements.map((m) => {
    // Time
    m.date = getDate(m.day, m.hour, m.timezoneOffset);
    omit(m, ['day', 'hour', 'timezoneOffset']);

    // Station
    const station = find(stations, { aqsid: m.aqsid });
    merge(m, station);
    omit(m, 'aqsid');

    return m;
  });

  // Final quality check, get rid of bad city and countries
  measurements = filter(measurements, (m) => {
    return (m.city && m.city !== 'N/A' && m.country && m.country.trim() !== '');
  });

  // Convert units to platform standard
  measurements = convertUnits(measurements);

  // Ship it off to be saved!
  return {name: 'unused', measurements: measurements};
};
