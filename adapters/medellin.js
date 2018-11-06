/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Sistema de Alerta Temprana de Medellín y el Valle de Aburrá - SIATA
 * data sources.
 *
 */
'use strict';

import { default as moment } from 'moment-timezone';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { convertUnits } from '../lib/utils';
import JSONStream from 'JSONStream';
import { DataStream, MultiStream } from 'scramjet';
import { pick } from 'lodash';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'medellin';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchStream = function (source) {
  return new MultiStream(
    ['co', 'no2', 'ozono', 'pm10', 'pm25', 'so2'].map(pollutant => {
      return request(`${source.url}EntregaData1/Datos_SIATA_Aire_AQ_${pollutant}_Last.json`)
        .pipe(JSONStream.parse('measurements.*'))
        .pipe(new DataStream())
        .use(stream => {
          stream.name = 'unused';
          return stream;
        })
        .map(extractMeasurements)
        .map(convertUnits);
    })
  ).mux();
};

const extractMeasurements = features => {
  // Pick just the items we want
  let o = pick(features, ['city', 'attribution', 'value', 'location', 'date', 'averagingPeriod', 'coordinates', 'parameter', 'unit', 'mobile']);

  // A few minor changes to match our format
  o.averagingPeriod.unit = o.averagingPeriod.units;
  delete o.averagingPeriod.units;
  o.attribution = [o.attribution];
  o.parameter = (o.parameter === 'pm10³') ? 'pm10' : o.parameter;

  // And generate the date
  const date = moment.tz(features.date.utc, 'America/Bogota');
  o.date = {
    utc: date.toDate(),
    local: date.format()
  };

  return o;
};
