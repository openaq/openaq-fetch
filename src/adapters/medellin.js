/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Sistema de Alerta Temprana de Medellín y el Valle de Aburrá - SIATA
 * data sources.
 *
 */

'use strict';

import client from '../lib/requests.js';
import log from '../lib/logger.js';
import { DateTime } from 'luxon';
import { convertUnits } from '../lib/utils.js';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import _ from 'lodash';

export const name = 'medellin';

const options = {
  headers: {
    'accept-language': 'en-US,en',
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json'
  },
  https: {
    rejectUnauthorized: false
  },
  timeout: { request: REQUEST_TIMEOUT }
};

export async function fetchData (source, cb) {
  try {
    const pollutants = ['co', 'no2', 'ozono', 'pm10', 'pm25', 'so2'];

    const allParams = pollutants.map(async (p) => {
      const url = `${source.url}EntregaData1/Datos_SIATA_Aire_AQ_${p}_Last.json`;

      try {
        const response = await client(url, options);
        return JSON.parse(response.body);
      } catch (error) {
        log.warn(error || `Unable to load data for parameter: ${p} for adapter ${source.name}`);
        return null;
      }
    });

    const allData = await Promise.all(allParams);

    const items = _.flatten(
      allData.map((a) => {
        return a.measurements;
      })
    );
    const measurements = items
      .map((item) => extractMeasurements(item))
      .filter((i) => i)
      .map((item) => convertUnits(item));

    cb(null, { name: 'unused', measurements });
  } catch (e) {
    cb(e);
  }
}

const extractMeasurements = (features) => {
  // Pick just the items we want
  let o = _.pick(features, [
    'city',
    'attribution',
    'value',
    'location',
    'date',
    'averagingPeriod',
    'coordinates',
    'parameter',
    'unit',
    'mobile'
  ]);

  // A few minor changes to match our format
  o.averagingPeriod.unit = o.averagingPeriod.units;
  delete o.averagingPeriod.units;
  o.attribution = [o.attribution];
  o.parameter = o.parameter === 'pm10³' ? 'pm10' : o.parameter;

  const date = DateTime.fromISO(features.date.utc);
  o.date = {
    utc: date.toUTC().toISO({ suppressMilliseconds: true }),
    local: date.setZone('America/Bogota').toISO({ suppressMilliseconds: true })
  };

  if (o.value <= -9999) {
    return null;
  }
  return o;
};
