'use strict';

import { default as moment } from 'moment-timezone';
import _ from 'lodash';
import log from '../lib/logger';
import { promiseRequest, unifyParameters } from '../lib/utils';

export const name = 'quito';

const parameters = ['PM 2.5', 'PM 10', 'CO', 'NO2', 'SO2', 'O3'];

// Get current date and time for query parameters
function getNowDateFields () {
  const dateNow = moment().tz('America/Guayaquil');
  const dateFields = {
    hour: dateNow.format('HH'),
    dom: dateNow.format('DD'),
    month: dateNow.format('MM'),
    year: dateNow.format('YYYY')
  };
  return dateFields;
}

// Fix local date to adhere to format
function sanitizeDate (date) {
  var utc = moment.tz(date['utc'], 'America/Guayaquil');
  return {
    utc: date['utc'],
    local: utc.format()
  };
}

export async function fetchData (source, cb) {
  try {
    let queryParams = getNowDateFields();
    // Get all the data for the day
    // (only way to get the most recent data as it defaults to hour 0
    // no matter what hour query parameter you send)
    queryParams.itvl = '24 hours';
    // Create promises with post requests and parsing for all parameters
    const allParams = parameters.map(p =>
      promiseRequest(source.url + '/dataset', { qs: { ...queryParams, ...{ magnitude: p } } })
        // in case a request fails, handle gracefully
        .catch(error => { log.warn(error || 'Unable to load data for parameter: ', p); return null; })
        .then(data => formatData(data)));

    const allData = await Promise.all(allParams);
    const measurements = _.flatten((allData.filter(d => (d))));

    cb(null, { name: 'unused', measurements });
  } catch (e) {
    cb(e);
  }
}

// Convert data to standard format
function formatData (data) {
  if (!data) return null;
  let dataObject = JSON.parse(data);
  const paramMeasurements = dataObject.map(element => {
    let m = {
      location: element['location'],
      value: Number(element['value']),
      unit: element['unit'],
      parameter: element['parameter'].replace(' ', ''),
      averagingPeriod: element['averagingPeriod'],
      date: sanitizeDate(element['date']),
      coordinates: element['coordinates'],
      attribution: element['attribution'],
      city: element['city']
    };
    if (m.parameter === 'SulfurDioxide') m.parameter = 'so2';
    return unifyParameters(m);
  });
  return paramMeasurements;
}
