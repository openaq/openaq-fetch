'use strict';

import _ from 'lodash';
import log from '../lib/logger.js';
import { promisePostRequest, unifyMeasurementUnits } from '../lib/utils.js';

export const name = 'rwanda';

export async function fetchData (source, cb) {
  try {
    // Create post requests for all parameters
    const params = ['PM25', 'PM10', 'O3', 'NO2', 'SO2', 'CO', 'PB'];
    const paramRequests = params.map(p =>
      promisePostRequest(source.url, { parameter: p })
      // Handle request errors gracefully
        .catch(error => { log.warn(error || 'Unable to load data for parameter'); return null; }));
    // Run post requests in parallel and wait for all to resolve
    let allData = await Promise.all(paramRequests);

    allData = allData.map(d => JSON.parse(d)).filter(d => (d));
    let measurements = allData.map(data => {
      // Create base object
      const base = {
        location: data.location,
        coordinates: data.coordinates,
        city: data.city,
        attribution: data.attribution,
        parameter: data.parameter,
        averagingPeriod: data.averagingPeriod
      };
      // Loop through array of values and dates
      const paramMeasurements = data.data.map(d => {
        const m = {
          date: { local: d.date_local, utc: d.date_utc },
          value: Number(d.value),
          unit: data.unit
        };
        unifyMeasurementUnits(m);
        return { ...base, ...m };
      });
      return paramMeasurements;
    });
    cb(null, { name: 'unused', measurements: _.flatten(measurements) });
  } catch (e) {
    cb(e);
  }
}
