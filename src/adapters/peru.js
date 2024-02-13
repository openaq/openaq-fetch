/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the OEFA Peru data source.
 */

import got from 'got';
import { DateTime } from 'luxon';
import log from '../lib/logger.js';

export const name = 'peru';

// Available parameters for the pollutants we are interested in.
const pollutants = [
  'pm10',
  'pm25',
  'so2',
  'co',
  'no2',
];

export async function fetchData(source, cb) {
  try {
    let stationIds = [...Array(35).keys()].map(i => i + 1);
    log.info(`Fetching data for station IDs: ${stationIds.join(', ')}`);
    
    const postResponses = stationIds.map((id) =>
      createRequests(id, source)
    );

    const results = await Promise.all(postResponses);

    let allMeasurements = [];
    log.info('Processing results...');
    
    results.forEach((result, index) => {
      if (result !== null) {
        log.info(`Formatting data for station ID: ${stationIds[index]}`);
        const measurements = formatData(result.lastDataObject);
        allMeasurements = allMeasurements.concat(measurements);
      } else {
        log.warn(`No data received for station ID: ${stationIds[index]}`);
      }
    });

    log.debug('All measurements compiled.', allMeasurements.length);
    cb(null, { name: 'unused', measurements: allMeasurements });
  } catch (error) {
    log.error('Error in fetchData:', error.message);
    cb(error);
  }
}

function formatData(data) {
  const measurements = [];
  const latitude = parseFloat(data.coordinates.latitude);
  const longitude = parseFloat(data.coordinates.longitude);

  pollutants.forEach((pollutant) => {
    if (data[pollutant] !== null) {
      const measurement = {
        date: {
          utc: DateTime.fromISO(data.date).toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
          local: DateTime.fromISO(data.date).setZone('America/Lima').toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
        },
        location: data.station,
        city: data.province,
        coordinates: { latitude, longitude },
        parameter: pollutant,
        value: parseFloat(data[pollutant]),
        unit: 'µg/m³',
        averagingPeriod: { unit: 'minutes', value: 5 },
        attribution: [
          { name: 'OEFA', url: 'https://www.gob.pe/oefa' },
        ],
      };
      measurements.push(measurement);
    }
  });

  return measurements;
}

async function createRequests(idStation, source) {
  const body = {
    user: "OPENAQ",
    password: "@mb13nt@l@1R3",
    startDate: "2024-10-12",
    endDate: "2024-10-13",
    // idStation: idStation.toString()
    idStation: 2
  };

  try {
    log.info(`Sending request for station ID: ${idStation}`);
    const response = await got.post(source.url, {
      json: body,
      responseType: 'json',
    });

    const data = response.body.data;
    if (data && data.length > 0) {
      log.info(`Data received for station ID: ${idStation}`);
      return { idStation, lastDataObject: data[data.length - 1] };
    } else {
      log.warn(`No data found for station ID: ${idStation}`);
      return null;
    }
  } catch (error) {
    log.error(`Error for station ID ${idStation}: ${error.response?.body || error.message}`);
    return null;
  }
}

// /**
//  * This code is responsible for implementing all methods related to fetching
//  * and returning data for the OEFA Peru data source.
//  */

// import got from 'got';
// import { DateTime } from 'luxon';
// import log from '../lib/logger.js';

// export const name = 'peru';

// const pollutants = [ // available parameters
//   'pm10',
//   'pm25',
//   'so2',
//   // 'h2s',
//   'co',
//   'no2',
//   // 'pbar',
//   // 'pp',
//   // 'temp',
//   // 'hr',
//   // 'ws',
//   // 'wd',
//   // 'rs',
// ];

// export async function fetchData (source, cb) {
//   try {
//     // const stationIds = Array.from({ length: 30 }, (_, i) => i + 1);
//     const stationIds = [
//       2, 4, 5, 7, 9, 10, 11, 12, 13, 19, 22, 23, 24, 25, 26, 27, 28,
//       29, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 47, 48, 49, 50, 51,
//       52,
//     ];
//     // let stationIds = [...Array(35).keys()].map(i => i + 1);
//     // console.log(stationIds);
    
//     log.debug('Station IDs:', stationIds);

//     // Create the requests for each station ID.
//     const postResponses = stationIds.map((id) =>
//       createRequest(id, source)
//     );

//     // Wait for all the requests to resolve.
//     const results = await Promise.all(postResponses);

//     // Process the data from each request.
//     let allMeasurements = [];
//     results.forEach((result) => {
//       if (result) {
//         const measurements = formatData(result);
//         allMeasurements = allMeasurements.concat(measurements);
//       }
//     });

//     log.debug('All measurements:', allMeasurements);
//     // Callback with the final array of measurements.
//     cb(null, { name: 'unused', measurements: allMeasurements });
//   } catch (error) {
//     log.error('Error in fetchData:', error);
//     cb(error);
//   }
// }

// // Helper function to format the data into a standard structure.
// function formatData(data) {
//   // Extract the necessary data from the response.
//   const { coordinates, date } = data.lastDataObject;
//   const measurements = [];

//   // Convert string date to DateTime object.
//   const dateLuxon = DateTime.fromISO(date);

//   // Iterate over each pollutant and create a measurement object if present.
//   pollutants.forEach((pollutant) => {
//     if (data.lastDataObject.hasOwnProperty(pollutant)) {
//       const value = data.lastDataObject[pollutant];
//       // Only create a measurement object if the value is not null.
//       if (value !== null) {
//         measurements.push({
//           date: {
//             utc: dateLuxon.toUTC().toISO(),
//             local: dateLuxon.setZone('America/Lima').toISO(),
//           },
//           location: data.lastDataObject.station,
//           city: data.lastDataObject.department, // Assuming 'department' is equivalent to 'city'.
//           coordinates: {
//             latitude: parseFloat(coordinates.latitude),
//             longitude: parseFloat(coordinates.longitude),
//           },
//           parameter: pollutant,
//           value: parseFloat(value),
//           unit: 'µg/m³',
//           averagingPeriod: { unit: 'minutes', value: 5 },
//           attribution: [{ name: 'OEFA', url: 'https://www.gob.pe/oefa' }],
//         });
//       }
//     }
//   });

//   return measurements;
// }

// // Helper function to create a request for each station ID.
// async function createRequest(idStation, source) {
//   const body = {
//     user: "OPENAQ",
//     password: "@mb13nt@l@1R3",
//     startDate: "2023-01-01", // These should be dynamic based on your needs.
//     endDate: "2023-10-12",
//     idStation: idStation.toString(),
//   };

//   try {
//     // Send the POST request to the API.
//     const response = await got.post(source.url, {
//       json: body,
//       responseType: 'json',
//     });

//     // Check if the data array is present and has at least one entry.
//     if (response.body.data && response.body.data.length > 0) {
//       // Return the last data object in the array.
//       return {
//         idStation,
//         lastDataObject: response.body.data[response.body.data.length - 1],
//       };
//     }

//     // If there's no data, log and return null.
//     log.debug(`No data for station ID ${idStation}`);
//     return null;
//   } catch (error) {
//     // Log the error with as much detail as available.
//     log.error(
//       `Error for station ID ${idStation}:`,
//       error.response ? error.response.body : error.message
//     );
//     return null;
//   }
// }
