'use strict';

import { default as FTP } from 'ftp';
import { find } from 'lodash';
import { default as moment } from 'moment-timezone';
import { convertUnits } from '../lib/utils';
import { promisify } from 'util';
import { StringStream } from 'scramjet';

export const name = 'airnow';

exports.fetchData = function (source, cb) {
  // A workaround to getting rate limited for 6 logins in 1 hr for AirNow
  // system. Only try to grab data in last 20 minutes of an hour.
  if (moment().minute() < 40) {
    return cb(null, {name: 'unused', measurements: []});
  }

  // First fetch the stations list and then get the latest measurements
  getStream('Locations/monitoring_site_locations.dat')
    .map(line => {
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
    })
    .toArray()
    .then(stations => {
      // Calculate file name
      const dateString = moment.utc().subtract(1, 'hours').format('YYYYMMDDHH');
      const file = `HourlyData/${dateString}.dat`;

      // Get and map all the measurements
      return getStream(source.url, file)
        .map((line) => ({
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
        }))
        .filter(
          ({parameter}) => accepted.indexOf(parameter) >= 0
        )
        .assign(({day, hour, timezoneOffset}) => ({
          date: getDate(day, hour, timezoneOffset)
        }))
        .assign(({aqsid}) => find(stations, {aqsid}))
        .each(
          (obj) => {
            delete obj['day'];
            delete obj['hour'];
            delete obj['timezoneOffset'];
            delete obj['aqsid'];
          }
        )
        .filter(
          ({city, country}) => city && city !== 'N/A' && country && country.trim() !== ''
        )
        .toArray();
    })
    .then(measurements => convertUnits(measurements))
    .catch(err => cb(err))
    .then(measurements => cb(null, {name: 'unused', measurements}))
  ;
};

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

const getDate = (day, time, offset) => {
  // Grab date from page, add time string and convert to date
  const dateString = `${day} ${time}`;

  // A bit odd looking here based on what we're getting in the files
  const utc = moment.utc(dateString, 'MM/DD/YYYY HH:mm');
  const local = moment.utc(dateString, 'MM/DD/YYYY HH:mm').utcOffset(offset);

  return {utc: utc.toDate(), local: local.format()};
};

const accepted = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co', 'bc'];

const getStream = async (url, file) => {
  const ftp = new FTP();

  await new Promise((resolve, reject) => {
    ftp.on('ready', resolve);
    ftp.on('error', reject);
    ftp.connect({host: url, user: process.env.AIRNOW_FTP_USER, password: process.env.AIRNOW_FTP_PASSWORD});
  });

  const stream = promisify(ftp.get)(file);
  stream.once('close', () => ftp.end());

  return stream.pipe(new StringStream())
    .split(/\r?\n/)
    .parse((line) => line.split('|'));
};
