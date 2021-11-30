/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Sistema de Alerta Temprana de Medellín y el Valle de Aburrá - SIATA
 * data sources.
 *
 */
'use strict';

import { default as moment } from 'moment-timezone';
import https from 'https';
import _ from 'lodash';
import { promiseRequest, convertUnits } from '../lib/utils';
import log from '../lib/logger';
import { REQUEST_TIMEOUT } from '../lib/constants';

exports.name = 'medellin';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const requestOptions = {
  method: 'GET',
  headers: {
    'accept-language': 'en-US,en',
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json'
  },
  form: false,
  timeout: REQUEST_TIMEOUT
};

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export async function fetchData (source, cb) {
  try {
    const pollutants = ['co', 'no2', 'ozono', 'pm10', 'pm25', 'so2'];
    // Create promises with post requests and parsing for all parameters
    const allParams = pollutants.map((p) => {
      const url = `${source.url}EntregaData1/Datos_SIATA_Aire_AQ_${p}_Last.json`;
      const options = Object.assign(requestOptions, {
        url: source.url,
        agent
      });
      return promiseRequest(url, options)
        .catch((error) => {
          log.warn(error || `Unable to load data for parameter: ${p} for adapter ${source.name}`);
          return null;
        })
        .then((data) => JSON.parse(data));
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
  // And generate the date
  const date = moment.tz(features.date.utc, 'America/Bogota');
  o.date = {
    utc: date.toDate(),
    local: date.format()
  };

  if (o.value <= -9999) {
    return null;
  }
  return o;
};
