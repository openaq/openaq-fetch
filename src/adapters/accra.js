'use strict';
import log from '../lib/logger.js';
import client from '../lib/requests.js';
import got from 'got';
import { DateTime } from 'luxon';

export const parameters = {
  pm1: { name: 'pm1', unit: 'µg/m³' },
  pm25: { name: 'pm25', unit: 'µg/m³' },
  pm10: { name: 'pm10', unit: 'µg/m³' },
  no2: { name: 'no2', unit: 'µg/m³' },
  humidity: { name: 'relativehumidity', unit: '%' },
};

const stationsUrl = 'https://breatheaccra.org/_next/data/sDbKIZJuzXb7sPDYTkBBo/index.json';
const ghanaStationsUrl = 'https://breatheaccra.org/_next/data/sDbKIZJuzXb7sPDYTkBBo/ghair.json';
const measurementsUrl = 'https://breatheaccra.org/api/LatestReadings';

export const name = 'accra';

export async function fetchData(source, cb) {
  try {
    const stations = await fetchStations();
    const measurements = await Promise.all(
      Object.values(stations).map(station => fetchMeasurements(station))
    );
    const formattedMeasurements = measurements.flatMap(m => m);
    return cb(null, { measurements: formattedMeasurements });
  } catch (error) {
    log.error('Failed to fetch data', error);
    cb(error);
  }
}

async function fetchStations() {
  try {
    const [accraResponse, ghanaResponse] = await Promise.all([
      client({ url: stationsUrl }),
      client({ url: ghanaStationsUrl })
    ]);

    const stations = {
      ...accraResponse.pageProps.sensors.reduce((obj, sensor) => {
        obj[sensor.deviceID] = sensor;
        return obj;
      }, {}),
      ...ghanaResponse.pageProps.sensors.reduce((obj, sensor) => {
        obj[sensor.deviceID] = sensor;
        return obj;
      }, {})
    };

    log.debug('Stations fetched:', Object.keys(stations).length);
    return stations;
  } catch (error) {
    throw new Error(`Fetch stations error: ${error.message}`);
  }
}

async function fetchMeasurements(station) {
  try {
    const response = await got.post(measurementsUrl, {
      json: { sensors: [{ type: station.type, deviceID: station.deviceID }] },
      responseType: 'json'
    });

    if (response.body.readings && response.body.readings.length > 0) {
      return formatData(response.body.readings[0], station);
    } else {
      log.debug(`No measurements found for station ${station.deviceID}`);
      return [];
    }
  } catch (error) {
    log.debug(`Fetch measurements error for station ${station.deviceID}: ${error.message}`);
    return [];
  }
}

function formatData(measurement, station) {
  const date = DateTime.fromFormat(measurement.time, 'M/d/yyyy, h:mm:ss a', { zone: 'Africa/Accra' });

  const formattedMeasurements = Object.entries(measurement.measurements).map(([key, value]) => {
    if (parameters[key]) {
      return {
        date: {
          utc: date.toUTC().toISO({ suppressMilliseconds: true }),
          local: date.toISO({ suppressMilliseconds: true }),
        },
        averagingPeriod: { unit: 'hours', value: 1 },
        city: station.district.name,
        attribution: [
          { name: 'Breathe Accra', url: 'https://breatheaccra.org/' }
        ],
        unit: parameters[key].unit,
        value: value,
        parameter: parameters[key].name,
        location: station.vicinity,
        coordinates: {
          longitude: station.longitude,
          latitude: station.latitude
        }
      };
    }
    return null;
  }).filter(m => m !== null);

  return formattedMeasurements;
}