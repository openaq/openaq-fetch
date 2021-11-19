'use strict';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { REQUEST_TIMEOUT } from '../lib/constants';
const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });

export const name = 'bogota';

export async function fetchData (source, cb) {
  try {
    request.get(source.url, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return cb({ message: 'Failed to load entry point url' }, null);
      }
      const data = JSON.parse(body);

      const measurements = data.map((d) => {
        const date = moment.tz(d.date.utc, 'America/Bogota').startOf('hour');
        d.date = {
          utc: date.toDate(),
          local: date.format('YYYY-MM-DDTHH:mm:ssZ')
        };

        d.country = source.country;
        d.attribution = [{ ...d.attribution }];
        d.sourceName = source.name;
        return d;
      });

      cb(null, { name: 'unused', measurements });
    });
  } catch (e) {
    cb(e);
  }
}
