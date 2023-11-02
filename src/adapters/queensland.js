'use strict';

import { removeUnwantedParameters } from '../lib/utils.js';
import _ from 'lodash';
import { DateTime } from 'luxon';
import { load } from 'cheerio';
import client from '../lib/requests.js';

export const name = 'queensland';

export function fetchData (source, cb) {
  client(source.url)
    .then((response) => {
      try {
        const data = formatData(response.body, source);
        const result = {
          name: 'unused',
          measurements: _.flatten(data),
        };

        result.measurements = removeUnwantedParameters(result.measurements);
        return cb(null, result);
      } catch (e) {
        return cb(e, { message: 'Unknown adapter error.' });
      }
    })
    .catch((err) => {
      return cb(err);
    });
}

const renameParameter = function (parameter) {
  switch (parameter) {
    case 'Nitrogen Dioxide':
      return 'no2';
    case 'Sulfur Dioxide':
      return 'so2';
    case 'Carbon Monoxide':
      return 'co';
    case 'Particle PM2.5':
      return 'pm25';
    case 'Ozone':
      return 'o3';
    case 'Particle PM10':
      return 'pm10';
    default:
      return parameter;
  }
};

const getParameterUnit = function (parameter) {
  switch (parameter) {
    case 'pm25':
    case 'pm10':
    case 'bc':
      return 'µg/m³';
    case 'no2':
    case 'so2':
    case 'o3':
    case 'co':
      return 'ppm';
    default:
      return '?';
  }
};

// hardcoded coordinates for locations with no coordinates from source
const locationCoordinates = {
  'Miles Airport': { latitude: -26.8088, longitude: 150.1799 },
  'Hopeland': { latitude: -26.8637, longitude: 150.5028 }
};

const formatData = function (data, source) {
  const $ = load(data, {xmlMode: true});

  const dateStr = $('category').attr('measurementdate') + $('category').attr('measurementhour');
  const date = DateTime.fromFormat(dateStr.trim(), 'yyyy-MM-ddHH', { zone: 'Australia/Queensland' });

  const dates = { utc: date.toUTC().toISO({ suppressMilliseconds: true }), local: date.toISO({ suppressMilliseconds: true }) };

  const measurements = [];

  $('measurement').each(function (i, elem) {
    const location = $(this).parent().attr('name');
    const param = renameParameter($(this).attr('name'));

    const m = {
      date: dates,
      parameter: param,
      location: location,
      value: Number($(this).text()),
      unit: getParameterUnit(param),
      city: $(this).parent().parent().attr('name'),
      attribution: [{
        name: 'The State of Queensland (Department of Environment and Science)',
        url: source.sourceURL
      }, {
        name: 'The State of Queensland (Department of Environment and Science)',
        url: $(this).parent().attr('information')
      }],
      averagingPeriod: { value: 1, unit: 'hours' }
    };

    // Add coordinates if they're available
    if ($(this).parent().attr('latitude') && $(this).parent().attr('longitude') && Number($(this).parent().attr('latitude')) !== 0 && Number($(this).parent().attr('longitude')) !== 0) {
      m.coordinates = {
        latitude: Number($(this).parent().attr('latitude')),
        longitude: Number($(this).parent().attr('longitude'))
      };
    }

    if (!m.coordinates && locationCoordinates[m.location]) {
      m.coordinates = locationCoordinates[m.location];
    }

    measurements.push(m);
  });
  return measurements;
};
