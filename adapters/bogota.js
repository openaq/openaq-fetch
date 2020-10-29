'use strict';

import { default as moment } from 'moment-timezone';
import { promiseRequest } from '../lib/utils';

export const name = 'bogota';

export async function fetchData (source, cb) {
  try {
    const data = JSON.parse(await promiseRequest(source.url));

    const measurements = data.map(d => {
      const date = moment.tz(d.date.utc, 'America/Bogota').startOf('hour');
      d.date = {
        utc: date.toDate(),
        local: date.format('YYYY-MM-DDTHH:mm:ssZ')
      };
      d.country = source.country;
      d.attribution = [{ ...d.attribution }];
      d.sourceName = source.name;
      return d;
    }
    );

    cb(null, { name: 'unused', measurements });
  } catch (e) {
    cb(e);
  }
}
