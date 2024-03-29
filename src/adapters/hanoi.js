// /**
//  * This code is responsible for implementing all methods related to fetching
//  * and returning data for the Hanoi data sources.
//  */

import { DateTime } from 'luxon';
import client from '../lib/requests.js';
import { unifyParameters } from '../lib/utils.js';

import log from '../lib/logger.js';

export const name = 'hanoi';

export async function fetchData (source, cb) {
  try {
    const stations = await fetchStations(source);
    const measurements = transformData(stations);
    log.debug(measurements);
    cb(null, {
      name: 'unused',
      measurements,
    });
  } catch (error) {
    log.error(error);
    cb(error);
  }
}

async function fetchStations (source) {
  try {
    const stations = await client({ url: source.url });

    const stationDataPromises = stations.map((station) =>
      fetchStationData(source.sourceURL, station.id)
    );

    const allStationData = await Promise.all(stationDataPromises);

    stations.forEach((station, index) => {
      station.measurements = allStationData[index];
    });

    return stations;
  } catch (error) {
    log.error('Error fetching stations:', error);
    throw error;
  }
}

async function fetchStationData (baseURL, stationId) {
  try {
    const data = await client({
      url: baseURL + `public/dailystat/${stationId}`
    });

    const measurements = {};
    const validParameters = [
      'PM2.5',
      'PM10',
      'NO2',
      'CO',
      'SO2',
      'O3',
    ];
    validParameters.forEach((param) => {
      if (data[param]) {
        measurements[param] = data[param].slice(-12);
      }
    });

    return measurements;
  } catch (error) {
    log.error(`Error fetching data for station ${stationId}:`, error);
    throw error;
  }
}

function transformData (stations) {
  let transformedData = [];

  stations.forEach((station) => {
    Object.keys(station.measurements).forEach((parameter) => {
      station.measurements[parameter].forEach((measurement) => {
        const hanoiTime = DateTime.fromFormat(
          measurement.time,
          'yyyy-MM-dd HH:mm',
          { zone: 'Asia/Ho_Chi_Minh' }
        );
        const transformedMeasurement = {
          parameter,
          date: {
            utc: hanoiTime
              .toUTC()
              .toISO({ suppressMilliseconds: true }),
            local: hanoiTime.toISO({ suppressMilliseconds: true })
          },
          value: parseFloat(measurement.value),
          unit: 'µg/m³',
          location: station.name,
          city: 'Hanoi',
          coordinates: {
            latitude: station.latitude,
            longitude: station.longtitude
          },
          attribution: [
            {
              name: 'Hanoi Air Quality Monitoring Network',
              url: 'https://moitruongthudo.vn.ae/'
            }
          ],
          averagingPeriod: { unit: 'hours', value: 1 }
        };
        transformedData.push(unifyParameters(transformedMeasurement));
      });
    });
  });
  transformedData = transformedData.filter(
    (measurement) =>
      !isNaN(measurement.value) && measurement.value !== null
  );
  return transformedData;
}
