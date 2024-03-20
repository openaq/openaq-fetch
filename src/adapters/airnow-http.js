'use strict';

import log from '../lib/logger.js';
import client from '../lib/requests.js';
import { acceptableParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';
import sj from 'scramjet';

const { StringStream } = sj;

export const name = 'airnow-http';

const getDate = (day, time, offset) => {
  const dateString = `${day} ${time}`;
  if (!dateString || !offset) {
    return false;
  }

  const utc = DateTime.fromFormat(dateString, 'MM/dd/yy HH:mm', {
    zone: 'utc',
  });
  const local = DateTime.fromFormat(dateString, 'MM/dd/yy HH:mm', {
    zone: 'utc',
  }).setZone(offset);

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

async function getLocations(url) {
  if (!_locationsStream[url]) {
    const locationsUrl = `${url}airnow/today/monitoring_site_locations.dat`;
    log.verbose(`Fetching AirNow locations from "${locationsUrl}"`);

			const locationsData = await client({ url: locationsUrl, responseType: 'text' });

			_locationsStream[url] = StringStream.from(locationsData)
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

export async function fetchStream(source) {
  try {
    const locations = await getLocations(source.url);
    log.debug(`Got ${Object.keys(locations).length} locations.`);

    const dateString = source.datetime
      ? source.datetime.toFormat('yyyyMMddHH')
      : DateTime.utc().minus({ hours: 1.1 }).toFormat('yyyyMMddHH');

    const url = `${source.url}airnow/today/HourlyData_${dateString}.dat`;

    log.info(`Fetching AirNow measurements from "${url}"`);

    const body = await client({ url, responseType: 'text' });

    return StringStream.from(body)
      .lines('\n')
      .map(async (m) => {
        try {
          m = m.split('|');
          const parameter =
            m[5] && m[5].toLowerCase().replace('.', '');
          const station = locations[m[2]];
          const datetime = getDate(m[0], m[1], parseFloat(m[4]));

          if (!datetime) {
            log.warn(
              `Cannot parse date ${m[0]} ${m[1]} offset: ${m[4]}`
            );
            return null;
          }

          if (!parameter) {
            log.warn(`Cannot parse parameter ${m[5]}`);
            return null;
          }

          if (!station) {
            log.warn(`Cannot find station`);
            return null;
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
              {
                name: 'US EPA AirNow',
                url: 'http://www.airnow.gov/',
              },
              { name: m[8].trim() },
            ],
            averagingPeriod: { unit: 'hours', value: 1 },
          };
        } catch (error) {
          log.debug(`Error processing measurement: ${error.message}`);
          return null;
        }
      })
      .filter((m) => m && acceptableParameters.includes(m.parameter));
  } catch (error) {
    log.debug(`Error in fetchStream: ${error.message}`);
    return StringStream.from([]);
  }
}
