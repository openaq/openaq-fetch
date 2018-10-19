'use strict';

import log from '../lib/logger';
import { default as moment } from 'moment-timezone';
import { acceptableParameters } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { StringStream } from 'scramjet';
import { MeasurementValidationError } from '../lib/errors';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'airnow-http';

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

// map of promises for each url (probably this will have just a single key)
const _locationsStream = {};

function getLocations (url) {
  if (!_locationsStream[url]) {
    const locationsUrl = `${url}airnow/today/monitoring_site_locations.dat`;
    log.verbose(`Fetching AirNow locations from "${locationsUrl}"`);
    _locationsStream[url] = StringStream
      .from(request(locationsUrl))
      .lines('\n')
      .parse((s) => {
        s = s.split('|');
        const ret = {
          aqsid: s[0],
          coordinates: {
            latitude: Number(s[8]),
            longitude: Number(s[9])
          },
          country: s[12],
          city: convertCity(s[16]) || s[20]
        };

        if (s[0].slice(0, 3) === 'NRB') {
          s.country = 'KE';
          s.city = 'Nairobi';
        }

        return ret;
      })
      .accumulate((acc, city) => {
        acc[city.aqsid] = city;
      }, {});
  }

  return _locationsStream[url];
}

exports.fetchStream = async function (source) {
  const locations = await getLocations(source.url);

  log.debug(`Got ${Object.keys(locations).length} locations.`);

  const dateString = moment.utc().subtract(1.1, 'hours').format('YYYYMMDDHH');
  const url = `${source.url}airnow/today/HourlyData_${dateString}.dat`;

  log.debug(`Fetching AirNow measurements from "${url}"`);
  return StringStream.from(request(url))
    .lines('\n')
    .parse(async m => {
      m = m.split('|');
      const parameter = m[5] && m[5].toLowerCase().replace('.', '');
      const station = locations[m[2]];

      if (!parameter) {
        throw new MeasurementValidationError(source, `Cannot parse parameter ${m[5]}`, m);
      }

      if (!station) {
        throw new MeasurementValidationError(source, `Cannot find station`, m);
      }

      return {
        coordinates: station.coordinates,
        city: station.city,
        country: station.country,
        location: m[3].trim(),
        date: getDate(m[0], m[1], Number(m[4])),
        parameter: (parameter === 'ozone') ? 'o3' : parameter,
        unit: m[6].toLowerCase(),
        value: Number(m[7]),
        attribution: [{name: 'US EPA AirNow', url: 'http://www.airnow.gov/'}, {name: m[8].trim()}],
        averagingPeriod: {unit: 'hours', value: 1}
      };
    })
    .filter(m => m && acceptableParameters.includes(m.parameter))
  ;
};
