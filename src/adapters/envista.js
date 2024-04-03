'use strict';

import log from '../lib/logger.js';
import client from '../lib/requests.js';

import { DateTime } from 'luxon';
import { parallelLimit } from 'async';
import { convertUnits, unifyMeasurementUnits } from '../lib/utils.js';

const headers = {
  Authorization: 'ApiToken ' + `1cab20bf-0248-493d-aedc-27aa94445d15`,
};

export const name = 'envista';

export async function fetchData(source, cb) {
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

    return cb(null, { name: 'unused', measurements: convertedResults });
  } catch (err) {
    log.error(`Error fetching data: ${err.message}`);
    return cb({ message: 'Failure to load data url.' });
  }
}

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

async function handleStation(source, regionName, station) {
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

function formatData(source, regionName, station, data, cb) {
  const base = {
    location: station.name,
    city: regionName,
    coordinates: {
      latitude: parseFloat(station.location.latitude),
      longitude: parseFloat(station.location.longitude),
    },
    averagingPeriod: { unit: 'hours', value: 0.25 }, // Believed to update every 15 minutes
    attribution: [
      {
        name: source.organization,
        url: source.url,
      },
    ],
  };

  const measurements = data.data
    .map((datapoint) => formatChannels(base, station, datapoint))
    .flat()
    .filter((measurement) => measurement);

  return cb(measurements);
}

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

function hasAcceptedParameters(station) {
  const stationParameters = station.monitors.map((monitor) =>
    monitor.name.toLowerCase().split('.').join('')
  );
  return acceptableParameters.some((param) =>
    stationParameters.includes(param)
  );
}

function isAcceptedParameter(parameter) {
  return acceptableParameters.includes(
    parameter.toLowerCase().split('.').join('')
  );
}

function getUnit(station, channel) {
  return station.monitors.find(
    (monitor) => monitor.channelId === channel.id
  ).units;
}

function getDate(value) {
  const dt = DateTime.fromISO(value).setZone('Asia/Jerusalem');
  const utc = dt.toUTC().toISO({ suppressMilliseconds: true });
  const local = dt.toISO({ suppressMilliseconds: true });
  return { date: { utc, local } };
}

const acceptableParameters = [
  'pm25',
  'pm10',
  'co',
  'so2',
  'no2',
  'bc',
  'o3',
];