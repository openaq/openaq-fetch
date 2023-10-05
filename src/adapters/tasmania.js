'use strict';

import { convertUnits } from '../lib/utils.js';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import flatten from 'lodash/flatten.js';
import cloneDeep from 'lodash/cloneDeep.js';

// note: this is the 'synchronous' version (lost hours to this!)
import { parse } from 'csv-parse/sync';
import { DateTime } from 'luxon';
import got from 'got';

export const name = 'tasmania';

export function fetchData (source, cb) {
  got(source.url, { timeout: { request: REQUEST_TIMEOUT } }).then(
    (response) => {
      try {
        if (response.statusCode !== 200) {
          throw new Error('Failure to load data url.');
        }

        const data = formatData(response.body, source);
        if (data === undefined) {
          throw new Error('Failure to parse data.');
        }
        cb(null, data);
      } catch (error) {
        cb(error, { message: 'Unknown adapter error.' }, null);
      }
    }
  );
}

const formatData = function (data, source) {
  const parseDate = function (string) {
    const date = DateTime.fromFormat(
      string.trim(),
      'HHmmss',
      { zone: 'Australia/Tasmania' }
    );

    if (!date.isValid) {
      throw new Error('Invalid date format');
    }

    return {
      utc: date.toUTC().toISO({ suppressMilliseconds: true }),
      local: date.toISO({ suppressMilliseconds: true }),
    };
  };

  // manually retrieved list of station names
  // new stations should be checked for naming on this map:
  // http://epa.tas.gov.au/_layouts/15/Lightbox.aspx?url=http%3A%2F%2Fepa.tas.gov.au%2FAir%2FLive%2Flatest_air_data_on_map.jpg

  const stations = {
    ST: 'Smithton',
    WY: 'Wynyard',
    ER: 'Emu River',
    WU: 'West Ulverstone',
    QT: 'Queenstown',
    DT: 'Devonport',
    SF: 'Sheffield',
    LT: 'Latrobe',
    DL: 'Deloraine',
    WE: 'Westbury',
    HA: 'Hadspen',
    LF: 'Longford',
    PE: 'Perth',
    GB: 'George Town',
    EX: 'Exeter',
    TI: 'Ti Tree Bend',
    SL: 'South Launceston',
    LD: 'Lilydale',
    SC: 'Scottsdale',
    DE: 'Derby',
    SH: 'St Helens',
    FI: 'Fingal',
    PO: 'Poatina',
    CT: 'Campbell Town',
    OL: 'Oatlands',
    TR: 'Triabunna',
    BC: 'Bream Creek',
    GR: 'Gretna',
    NN: 'New Norfolk',
    GO: 'Glenorchy',
    HT: 'Hobart',
    MT: 'Mornington',
    JB: 'Judbury',
    HV: 'Huonville',
    CY: 'Cygnet',
    GV: 'Geeveston',
  };

  let output = [];
  let measurements = [];

  data = (data || '')
    .split('\n')
    .filter((i) => !!i.trim())
    .map((j) => j.trim())
    .join('\n');
  // parse the csv feed, exclude # lines
  output = parse(data, { trim: true, comment: '#' });

  // loop through the csv rows
  for (let k = 0; k < output.length; k++) {
    const value = output[k];
    const currentDate = value[1];
    const location = stations[value[0]];
    if (currentDate === '999999' || location === undefined) {
      continue;
    }
    const dates = parseDate(currentDate);
    const pm25 = value[2];
    const pm10 = value[3];
    const lat = value[4];
    const lng = value[5];

    const baseObj = {
      location: location,
      city: source.city,
      unit: 'µg/m³',
      averagingPeriod: { value: 0.25, unit: 'hours' },
      attribution: [
        {
          name: 'Environmental Protection Authority - Tasmania',
          url: 'http://epa.tas.gov.au',
        },
      ],
      coordinates: {
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
      },
      date: dates,
    };

    const objPM25 = cloneDeep(baseObj);
    objPM25.value = parseFloat(pm25);
    objPM25.parameter = 'pm25';
    measurements.push(objPM25);

    const objPM10 = cloneDeep(baseObj);
    objPM10.value = parseFloat(pm10);
    objPM10.parameter = 'pm10';
    measurements.push(objPM10);
  }

  measurements = convertUnits(flatten(measurements));
  return {
    name: 'unused',
    measurements: measurements,
  };
};
