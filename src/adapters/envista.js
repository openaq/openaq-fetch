'use strict';

import log from '../lib/logger.js';
import client from '../lib/requests.js';

import { DateTime } from 'luxon';
import { parallel, parallelLimit } from 'async';
import { convertUnits, unifyMeasurementUnits } from '../lib/utils.js';

const headers = {
  Authorization: 'ApiToken ' + `1cab20bf-0248-493d-aedc-27aa94445d15`,
};

export const name = 'envista';

export async function fetchData(source, cb) {
  let regionListUrl = source.url + 'regions';

  try {
    const regionList = await client({
      url: regionListUrl,
      headers: headers,
    });
    
    let tasks = regionList.map((region) => {
      return new Promise((resolve, reject) => {
        handleRegion(
          source,
          region
        )((err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        });
      });
    });

    Promise.all(tasks)
      .then((results) => {
        results = results.flat(Infinity);
        results = convertUnits(results);
        return cb(null, { name: 'unused', measurements: results });
      })
      .catch((err) => {
        return cb(err, []);
      });
  } catch (err) {
    return cb({ message: 'Failure to load data url.' });
  }
}

const handleRegion = function (source, region) {
  let stationList = region.stations;

  return function (done) {
    let tasks = [];

    stationList.forEach((station) => {
      if (station.active && hasAcceptedParameters(station)) {
        tasks.push(function (callback) {
          handleStation(source, region.name, station)
            .then((measurements) => callback(null, measurements))
            .catch((err) => callback(err));
        });
      }
    });

    let limit = 15; // Magic number to avoid rate limiting is 16.

    parallelLimit(tasks, limit, (err, results) => {
      if (err) {
        log.error(`Error in handleRegion: ${err.message}`);
        return done(err, []);
      }
      return done(null, results);
    });
  };
};

const handleStation = async function (source, regionName, station) {
  let stationUrl = source.url + 'stations/' + station.stationId + '/data/latest';

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
    log.error(`Error fetching data: ${err.message}`);
    throw err; // Re-throw the error to be caught by the caller
  }
};

const formatData = function (source, regionName, station, data, cb) {
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

  const measurements = data.data.map((datapoint) =>
    formatChannels(base, station, datapoint)
  );
  return cb(measurements);
};

const formatChannels = function (base, station, datapoint) {
  base.date = getDate(datapoint.datetime);
  const datapoints = datapoint.channels.map((channel) => {
    if (isAcceptedParameter(channel.name)) {
      return getMeasurement(base, station, channel);
    }
  });
  const filteredData = datapoints.filter((point) => point); // removes undefined/invalid measurements
  return filteredData;
};

const hasAcceptedParameters = function (station) {
  const stationParameters = station.monitors.map((monitor) =>
    monitor.name.toLowerCase().split('.').join('')
  );
  const stationAcceptableParameters = acceptableParameters.filter(
    (param) => !stationParameters.includes(param)
  );
  return Boolean(stationAcceptableParameters);
};

const isAcceptedParameter = function (parameter) {
  return acceptableParameters.includes(
    parameter.toLowerCase().split('.').join('')
  );
};

const getMeasurement = function (base, station, channel) {
  let measurement = { ...base };
  let parameterName = channel.name.toLowerCase().split('.').join('');
  measurement.parameter = parameterName;
  measurement.value = channel.value;
  measurement.unit = getUnit(station, channel);
  measurement = unifyMeasurementUnits(measurement);
  return measurement;
};

const getUnit = function (station, channel) {
  return station.monitors.find(
    (monitor) => monitor.channelId === channel.id
  ).units;
};

function getDate(value) {
  const dt = DateTime.fromISO(value).setZone('Asia/Jerusalem');
  const utc = dt.toUTC().toISO({ suppressMilliseconds: true });
  const local = dt.toISO({ suppressMilliseconds: true });
  return { utc, local };
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
