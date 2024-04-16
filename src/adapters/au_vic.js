'use strict';

import { DateTime } from 'luxon';
import Bottleneck from 'bottleneck';
import client from '../lib/requests.js';
import log from '../lib/logger.js';

const maxRequestsPerSecond = 5;
const limiter = new Bottleneck({
  reservoir: maxRequestsPerSecond,
  reservoirRefreshAmount: maxRequestsPerSecond,
  reservoirRefreshInterval: 1000,
  maxConcurrent: 1,
  minTime: (1000 / maxRequestsPerSecond) + 50
});

const parameters = {
  'PM2.5': 'pm25',
  'PM10': 'pm10',
  'NO2': 'no2',
  'SO2': 'so2',
  'O3': 'o3',
  'CO': 'co',
  'BC': 'bc'
};

const units = {
  '&micro;g/m&sup3;': 'µg/m³',
  'ppm': 'ppm',
  'ppb': 'ppb'
};

const cities = {
  'Coolaroo': 'Melbourne',
  'Dallas': 'Melbourne',
  'Macleod': 'Melbourne',
  'Alphington': 'Melbourne',
  'Footscray': 'Melbourne',
  'Brooklyn': 'Melbourne',
  'Melbourne CBD': 'Melbourne',
  'Box Hill': 'Melbourne',
  'Brighton': 'Melbourne',
  'Dandenong': 'Melbourne',
  'Mooroolbark': 'Melbourne',
  'Geelong South': 'Geelong',
  'Morwell South': 'Morwell',
  'Morwell East': 'Morwell'
};

export const name = 'victoria';

/**
 * Fetches data from the specified source.
 * @param {Object} source - The data source configuration.
 * @param {Function} cb - The callback function to handle the fetched data.
 */
export async function fetchData(source, cb) {

  try {
    const headers = { 'X-API-Key': source.credentials.token };
    const response = await limiter.schedule(() => client({ url: source.url, headers }));
    const stations = response.records;

    const measurements = [];

    for (const station of stations) {
      try {
        const stationMeasurements = await limiter.schedule(() => fetchMeasurements(station.siteID, headers));
        const formattedMeasurements = formatData(stationMeasurements);
        measurements.push(...formattedMeasurements);
      } catch (error) {
        log.error(error);
      }
    }

    log.info(`Fetched ${measurements.length} measurements from ${stations.length} stations`);
    cb(null, { name: 'unused', measurements });
  } catch (error) {
    cb({ message: 'Failure to load data url.', error });
  }
}

/**
 * Fetches measurements for a specific site.
 * @param {string} siteID - The ID of the site.
 * @param {Object} headers - The request headers.
 * @returns {Promise<Object>} - A promise that resolves to the measurement data.
 */
async function fetchMeasurements(siteID, headers) {
  const url = `https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1/sites/${siteID}/parameters`;
  const response = await client({ url, headers });
  return response;
}

/**
 * Formats a single row of measurement data.
 * @param {Object} row - The row of measurement data.
 * @param {Object} baseProperties - The base properties for the measurement.
 * @returns {Object|null} - The formatted measurement object or null if the parameter is not found or invalid.
 */
function formatRow(row, baseProperties) {
  const measurement = { ...baseProperties };

  if (parameters[row.name]) {
    measurement.parameter = parameters[row.name];
  } else {
    return null;
  }

  const averageReadings = row.timeSeriesReadings.filter(reading => reading.timeSeriesName === '1HR_AV');

  if (averageReadings.length && averageReadings[0].readings.length) {
    const reading = averageReadings[0].readings[0];
    if (reading.unit in units) {
      measurement.unit = units[reading.unit];
      measurement.averagingPeriod = { value: 1, unit: 'hours' };
      measurement.value = Number(reading.averageValue);

      const date = DateTime.fromISO(reading.until, { zone: 'Australia/Melbourne' });
      measurement.date = {
        utc: date.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
        local: date.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ")
      };

      return measurement;
    }
  }

  return null;
}

/**
 * Formats the measurements data for a single station.
 * @param {Object} measurements - The measurements data for a station.
 * @param {Object} station - The station object.
 * @returns {Object[]} - An array of formatted measurement objects.
 */
function formatData(measurements) {
  const baseProperties = {
    location: measurements.siteName,
    city: cities[measurements.siteName] || measurements.siteName,
    country: 'AU',
    sourceName: measurements.name,
    sourceType: 'government',
    attribution: [{
      name: 'EPA Victoria State Government of Victoria',
      url: 'https://www.epa.vic.gov.au/EPAAirWatch'
    }],
    coordinates: {
      latitude: measurements.geometry.coordinates[0],
      longitude: measurements.geometry.coordinates[1]
    }
  };

  return measurements.parameters && measurements.parameters.length
    ? measurements.parameters.map(parameter => formatRow(parameter, baseProperties)).filter(measurement => measurement !== null)
    : [];
}
