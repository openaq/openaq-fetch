'use strict';

import log from '../lib/logger.js';
import client from '../lib/requests.js';

import { DateTime } from 'luxon';
import { parallelLimit } from 'async';
import { convertUnits, unifyMeasurementUnits, acceptableParameters } from '../lib/utils.js';


export const name = 'israel-envista';

/**
 * Fetches data from the Israel Envista API.
 * @param {Object} source - The source configuration object.
 * @param {Function} cb - The callback function to handle the fetched data.
 */
export async function fetchData(source, cb) {
  const headers = {
    Authorization: 'ApiToken ' + `${source.credentials.token}`,
  };
  
  const regionListUrl = source.url + 'regions';

  try {
    const regionList = await client({
      url: regionListUrl,
      headers: headers,
    });

    const tasks = regionList.map((region) => handleRegion(source, region));

    const results = await Promise.all(tasks);
    const flatResults = results.flat(Infinity);
    const convertedResults = convertUnits(flatResults);

    log.debug(`Example measurements: ${convertedResults.slice(0,5)} .`);
    return cb(null, { name: 'unused', measurements: convertedResults });
  } catch (err) {
    log.error(`Error fetching data: ${err.message}`);
    return cb({ message: 'Failure to load data url.' });
  }
}

/**
 * Handles the processing of a single region.
 * @param {Object} source - The source configuration object.
 * @param {Object} region - The region object.
 * @returns {Promise} A promise that resolves to an array of measurements for the region.
 */
async function handleRegion(source, region) {
  const stationList = region.stations.filter(
    (station) => station.active && hasAcceptedParameters(station)
  );

  const limit = 15; // Magic number to avoid rate limiting is 16.

  return new Promise((resolve, reject) => {
    parallelLimit(
      stationList.map((station) => (callback) =>
        handleStation(source, region.name, station).then(
          (measurements) => callback(null, measurements),
          (err) => callback(err)
        )
      ),
      limit,
      (err, results) => {
        if (err) {
          log.error(`Error in handleRegion: ${err.message}`);
          reject(err);
        } else {
          resolve(results);
        }
      }
    );
  });
}

/**
 * Handles the processing of a single station.
 * @param {Object} source - The source configuration object.
 * @param {string} regionName - The name of the region.
 * @param {Object} station - The station object.
 * @returns {Promise} A promise that resolves to an array of measurements for the station.
 */
async function handleStation(source, regionName, station) {
  const headers = {
    Authorization: 'ApiToken ' + `${source.credentials.token}`,
  };
  
  const stationUrl = `${source.url}stations/${station.stationId}/data/latest`;
  try {
    const data = await client({
      url: stationUrl,
      headers: headers,
    });
    return new Promise((resolve) => {
      formatData(source, regionName, station, data, (measurements) => {
        resolve(measurements);
      });
    });
  } catch (err) {
    log.error(`Error fetching station data: ${err.message}`);
    return [];
  }
}

/**
 * Formats the data for a single station.
 * @param {Object} source - The source configuration object.
 * @param {string} regionName - The name of the region.
 * @param {Object} station - The station object.
 * @param {Object} data - The data object retrieved from the API.
 * @param {Function} cb - The callback function to handle the formatted measurements.
 */
function formatData(source, regionName, station, data, cb) {
  const base = {
    location: station.name,
    city: regionName,
    coordinates: {
      latitude: parseFloat(station.location.latitude),
      longitude: parseFloat(station.location.longitude),
    },
    averagingPeriod: { unit: 'minutes', value: 5 }, // Updates every 5 minutes
    attribution: [
      {
        name: source.organization,
        url: source.url,
      },
    ],
  };

  const timeWindow = DateTime.utc().minus({ hours: 6 });

  const filteredData = data.data.filter((datapoint) => {
    const measurementDateTime = DateTime.fromISO(datapoint.datetime);
    return measurementDateTime >= timeWindow;
  });

  const measurements = filteredData
    .map((datapoint) => formatChannels(base, station, datapoint))
    .flat()
    .filter((measurement) => measurement);

  return cb(measurements);
}

/**
 * Formats the channels for a single datapoint.
 * @param {Object} base - The base measurement object.
 * @param {Object} station - The station object.
 * @param {Object} datapoint - The datapoint object.
 * @returns {Array} An array of formatted measurements.
 */
function formatChannels(base, station, datapoint) {
  const date = getDate(datapoint.datetime);

  return datapoint.channels
    .filter((channel) => isAcceptedParameter(channel.name))
    .map((channel) => ({
      ...base,
      ...date,
      parameter: channel.name.toLowerCase().split('.').join(''),
      value: channel.value,
      unit: getUnit(station, channel),
    }))
    .map(unifyMeasurementUnits);
}

/**
 * Checks if a station has accepted parameters.
 * @param {Object} station - The station object.
 * @returns {boolean} True if the station has accepted parameters, false otherwise.
 */
function hasAcceptedParameters(station) {
  const stationParameters = station.monitors.map((monitor) =>
    monitor.name.toLowerCase().split('.').join('')
  );
  return acceptableParameters.some((param) =>
    stationParameters.includes(param)
  );
}

/**
 * Checks if a parameter is accepted.
 * @param {string} parameter - The parameter to check.
 * @returns {boolean} True if the parameter is accepted, false otherwise.
 */
function isAcceptedParameter(parameter) {
  return acceptableParameters.includes(
    parameter.toLowerCase().split('.').join('')
  );
}

/**
 * Gets the unit for a channel.
 * @param {Object} station - The station object.
 * @param {Object} channel - The channel object.
 * @returns {string} The unit for the channel.
 */
function getUnit(station, channel) {
  return station.monitors.find(
    (monitor) => monitor.channelId === channel.id
  ).units;
}

/**
 * Gets the date object from a datetime string.
 * @param {string} value - The datetime string.
 * @returns {Object} An object containing the UTC and local date strings.
 */
function getDate(value) {
  const dt = DateTime.fromISO(value).setZone('Asia/Jerusalem');
  const utc = dt.toUTC().toISO({ suppressMilliseconds: true });
  const local = dt.toISO({ suppressMilliseconds: true });
  return { date: { utc, local } };
}
