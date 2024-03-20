/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Hong Kong data source.
 */

'use strict';

import { convertUnits } from '../lib/utils.js';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import client from '../lib/requests.js';
import log from '../lib/logger.js';

export const name = 'hong-kong';

const timeZone = 'Asia/Hong_Kong';

export const fetchData = async (source, cb) => {
  try {
    const response = await client({ url: `${source.url}/24pc_Eng.xml` , responseType: 'text' });

    const data = formatData(response);

    if (data.length === 0) {
      return cb({ message: 'Failure to parse data.' });
    }
    return cb(null, data);
  } catch (err) {
    return cb({ message: `${err.message}` });
  }
};

const formatData = function (data) {
  let measurements = [];
  const $ = load(data, { xmlMode: true });
  const rootElement = $('AQHI24HrPollutantConcentration');
  const lastBuildDate = DateTime.fromFormat(
    rootElement.children('lastBuildDate').text(),
    'EEE, d LLL yyyy HH:mm:ss ZZZ',
    { zone: timeZone }
  );

  rootElement
    .children('PollutantConcentration')
    .filter(function (index, element) {
      const dateMoment = DateTime.fromFormat(
        $(element).children('DateTime').text(),
        'EEE, d LLL yyyy HH:mm:ss ZZZ',
        { zone: timeZone }
      );
      return (
        dateMoment.day === lastBuildDate.day &&
        dateMoment.hour === lastBuildDate.hour
      );
    })
    .each(function (i, element) {
      const obj = $(element);
      // Gets station name
      const stationName = obj.children('StationName').text();
      const dateMoment = DateTime.fromFormat(
        obj.children('DateTime').text(),
        'EEE, d LLL yyyy HH:mm:ss ZZZ',
        { zone: timeZone }
      );
      const stationObj = hongKongLocations[stationName];
      // Create a based object
      const base = {
        location: stationName,
        city: stationObj.city,
        date: {
          utc: dateMoment
            .toUTC()
            .toISO({ suppressMilliseconds: true }),
          local: dateMoment.toISO({ suppressMilliseconds: true }),
        },
        coordinates: stationObj.coordinates,
        attribution: [
          {
            name: 'Environmental Protection Department',
            url: 'https://data.gov.hk/en-data/dataset/hk-epd-airteam-past24hr-pc-of-individual-air-quality-monitoring-stations',
          },
        ],
        averagingPeriod: { value: 1, unit: 'hours' },
      };

      // NO2
      if (
        obj.has('NO2') &&
        obj.children('NO2').text() !== '' &&
        obj.children('NO2').text() !== '-'
      ) {
        const no2 = Object.assign(
          {
            parameter: 'no2',
            value: parseFloat(obj.children('NO2').text()),
            unit: 'µg/m³',
          },
          base
        );
        measurements.push(no2);
      }

      // O3
      if (
        obj.has('O3') &&
        obj.children('O3').text() !== '' &&
        obj.children('O3').text() !== '-'
      ) {
        const o3 = Object.assign(
          {
            parameter: 'o3',
            value: parseFloat(obj.children('O3').text()),
            unit: 'µg/m³',
          },
          base
        );
        measurements.push(o3);
      }

      // SO2
      if (
        obj.has('SO2') &&
        obj.children('SO2').text() !== '' &&
        obj.children('SO2').text() !== '-'
      ) {
        const so2 = Object.assign(
          {
            parameter: 'so2',
            value: parseFloat(obj.children('SO2').text()),
            unit: 'µg/m³',
          },
          base
        );
        measurements.push(so2);
      }

      // CO
      if (
        obj.has('CO') &&
        obj.children('CO').text() !== '' &&
        obj.children('CO').text() !== '-'
      ) {
        const co = Object.assign(
          {
            parameter: 'co',
            value: parseFloat(obj.children('CO').text()),
            unit: 'µg/m³',
          },
          base
        );
        measurements.push(co);
      }

      // PM10
      if (
        obj.has('PM10') &&
        obj.children('PM10').text() !== '' &&
        obj.children('PM10').text() !== '-'
      ) {
        const pm10 = Object.assign(
          {
            parameter: 'pm10',
            value: parseFloat(obj.children('PM10').text()),
            unit: 'µg/m³',
          },
          base
        );
        measurements.push(pm10);
      }

      // PM2.5
      // The name of element including dot, it should be escaped.
      if (
        obj.has('PM2\\.5') &&
        obj.children('PM2\\.5').text() !== '' &&
        obj.children('PM2\\.5').text() !== '-'
      ) {
        const pm25 = Object.assign(
          {
            parameter: 'pm25',
            value: parseFloat(obj.children('PM2\\.5').text()),
            unit: 'µg/m³',
          },
          base
        );
        measurements.push(pm25);
      }
    });

  measurements = convertUnits(measurements);
  return { name: 'unused', measurements: measurements };
};

// The data is generated from https://github.com/ymhuang0808/hk-air-quality-stations/blob/master/index.js
const hongKongLocations = {
  Eastern: {
    city: 'Eastern',
    coordinates: {
      longitude: 114.21944444444445,
      latitude: 22.282777777777778,
    },
  },
  'Tuen Mun': {
    city: 'N.T.',
    coordinates: {
      longitude: 113.97666666666667,
      latitude: 22.391111111111112,
    },
  },
  'Tung Chung': {
    city: 'New Territories',
    coordinates: {
      longitude: 113.94361111111111,
      latitude: 22.28888888888889,
    },
  },
  'Mong Kok': {
    city: 'Kowloon',
    coordinates: {
      longitude: 114.16833333333334,
      latitude: 22.322499999999998,
    },
  },
  Central: {
    city: 'Central',
    coordinates: {
      longitude: 114.15805555555556,
      latitude: 22.281944444444445,
    },
  },
  'Tap Mun': {
    city: 'Tap Mun Police Post',
    coordinates: {
      longitude: 114.36083333333333,
      latitude: 22.47138888888889,
    },
  },
  'Causeway Bay': {
    city: 'Causeway Bay',
    coordinates: { longitude: 114.185, latitude: 22.279999999999998 },
  },
  'Tseung Kwan O': {
    city: 'Sai Kung',
    coordinates: {
      longitude: 114.25944444444444,
      latitude: 22.317777777777778,
    },
  },
  'Sham Shui Po': {
    city: 'Kowloon',
    coordinates: {
      longitude: 114.15916666666668,
      latitude: 22.330277777777777,
    },
  },
  'Kwai Chung': {
    city: 'New Territories',
    coordinates: {
      longitude: 114.12972222222221,
      latitude: 22.357222222222223,
    },
  },
  'Tai Po': {
    city: 'New Territories',
    coordinates: {
      longitude: 114.16444444444446,
      latitude: 22.450833333333332,
    },
  },
  'Sha Tin': {
    city: 'New Territories',
    coordinates: {
      longitude: 114.18444444444445,
      latitude: 22.37638888888889,
    },
  },
  'Yuen Long': {
    city: 'New Territories',
    coordinates: {
      longitude: 114.02277777777778,
      latitude: 22.44527777777778,
    },
  },
  'Central/Western': {
    city: 'Central & Western',
    coordinates: { longitude: 114.14444444444445, latitude: 22.285 },
  },
  'Kwun Tong': {
    city: 'Kowloon',
    coordinates: {
      longitude: 114.22472222222223,
      latitude: 22.313333333333333,
    },
  },
  'Tsuen Wan': {
    city: 'New Territories',
    coordinates: {
      longitude: 114.11444444444444,
      latitude: 22.371666666666666,
    },
  },
  North: {
    city: 'New Territories',
    coordinates: { longitude: 114.12824, latitude: 22.49671 },
  },
  Southern: {
    city: 'Hong Kong',
    coordinates: { longitude: 114.16015, latitude: 22.24743 },
  },
};
