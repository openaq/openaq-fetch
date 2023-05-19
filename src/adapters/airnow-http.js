'use strict';

import log from '../lib/logger.js';
import { acceptableParameters } from '../lib/utils.js';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { MeasurementValidationError } from '../lib/errors.js';

import got from 'got';
import { DateTime } from 'luxon';
import { default as baseRequest } from 'request';
import sj from 'scramjet';

const { StringStream } = sj;

const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });

export const name = 'airnow-http';

const getDate = (day, time, offset) => {
  const dateString = `${day} ${time}`;
  if (!dateString || !offset) {
    return false;
  }

  const utc = DateTime.fromFormat(
    dateString,
    'MM/dd/yy HH:mm',
    { zone: 'utc' }
  );
  const local = DateTime.fromFormat(
    dateString,
    'MM/dd/yy HH:mm',
    { zone: 'utc' }
  ).setZone(offset);

  return {
    utc: utc.toISO({ suppressMilliseconds: true }),
    local: local.toISO({ suppressMilliseconds: true }),
    raw: `${dateString}(${offset})`,
  };
};

// Helper to convert city name
const convertCity = function (city) {
  if (!city) {
    return '';
  }
  return city.split(',')[0].trim();
};

// map of promises for each url (probably this will have just a single key)
const _locationsStream = {};

function getLocations(url) {
  if (!_locationsStream[url]) {
    const locationsUrl = `${url}airnow/today/monitoring_site_locations.dat`;
    log.verbose(`Fetching AirNow locations from "${locationsUrl}"`);
    _locationsStream[url] = StringStream.from(request(locationsUrl))
      .lines('\n')
      .parse((s) => {
        s = s.split('|');
        const ret = {
          aqsid: s[0],
          coordinates: {
            latitude: parseFloat(s[8]),
            longitude: parseFloat(s[9]),
          },
          country: s[12],
          city: convertCity(s[16]) || s[20],
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

export async function fetchStream (source) {
  const locations = await getLocations(source.url);
  log.debug(`Got ${Object.keys(locations).length} locations.`);

  const dateString = source.datetime
    ? source.datetime.toFormat('yyyyMMddHH')
    : DateTime.utc().minus({ hours: 1.1 }).toFormat('yyyyMMddHH');

  const url = `${source.url}airnow/today/HourlyData_${dateString}.dat`;

  log.info(`Fetching AirNow measurements from "${url}"`);
  return StringStream.from(request(url))
    .lines('\n')
    .parse(async (m) => {
      m = m.split('|');
      const parameter = m[5] && m[5].toLowerCase().replace('.', '');
      const station = locations[m[2]];
      const datetime = getDate(m[0], m[1], parseFloat(m[4]));

      if (!datetime) {
        throw new MeasurementValidationError(
          source,
          `Cannot parse date ${m[0]} ${m[1]} offset: ${m[4]}`,
          m
        );
      }

      if (!parameter) {
        throw new MeasurementValidationError(
          source,
          `Cannot parse parameter ${m[5]}`,
          m
        );
      }

      if (!station) {
        throw new MeasurementValidationError(
          source,
          `Cannot find station`,
          m
        );
      }

      return {
        coordinates: station.coordinates,
        city: station.city,
        country: station.country,
        location: m[3].trim(),
        date: datetime,
        parameter: parameter === 'ozone' ? 'o3' : parameter,
        unit: m[6].toLowerCase(),
        value: parseFloat(m[7]),
        attribution: [
          { name: 'US EPA AirNow', url: 'http://www.airnow.gov/' },
          { name: m[8].trim() },
        ],
        averagingPeriod: { unit: 'hours', value: 1 },
      };
    })
    .filter((m) => m && acceptableParameters.includes(m.parameter));
}
