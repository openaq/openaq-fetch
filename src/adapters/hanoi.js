// /**
//  * This code is responsible for implementing all methods related to fetching
//  * and returning data for the Hanoi data sources.
//  */

// 'use strict';

import { DateTime } from 'luxon';
import client from '../lib/requests.js';
import log from '../lib/logger.js';

// export const name = 'hanoi';

// export async function fetchData (source, cb) {
//     try {
//         const data = await getAirQualityData(source.url);
//         cb(null, {
//         name: 'unused',
//         measurements: data,
//         });
//     } catch (error) {
//         log.error(error);
//         cb(error);
//     }
//     }

async function fetchStations() {
  try {
    const response = await client(
      'https://moitruongthudo.vn/api/site'
    );
    const stations = JSON.parse(response.body);

    const stationDataPromises = stations.map((station) =>
      fetchStationData(station.id)
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

async function fetchStationData(stationId) {
  try {
    const response = await client(
      `https://moitruongthudo.vn/public/dailystat/${stationId}`
    );
    const data = JSON.parse(response.body);

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
        measurements[param] = data[param].slice(-3);
      }
    });

    return measurements;
  } catch (error) {
    log.error(`Error fetching data for station ${stationId}:`, error);
    throw error;
  }
}

// Use this function to get the data
fetchStations()
  .then((stations) => {
    console.log(stations[0].measurements.PM10, { depth: null });
  })
  .catch((error) => {
    log.error('An error occurred:', error);
  });
