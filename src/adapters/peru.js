/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the OEFA Peru data source.
 */

import { DateTime } from 'luxon';
import log from '../lib/logger.js';
import client from '../lib/requests.js';
import { hourUTC } from '../lib/utils.js';

import {
  FetchError,
  AUTHENTICATION_ERROR,
  DATA_PARSE_ERROR,
	FETCHER_ERROR,
} from '../lib/errors.js';


export const name = 'peru';

const pollutants = [ // all available parameters
  'pm10',
  'pm25',
  'so2',
  // 'h2s',
  'co',
  'no2',
  // 'pbar',
  // 'pp',
  // 'temp',
  // 'hr',
  // 'ws',
  // 'wd',
  // 'rs',
];

/**
 * Fetches air quality data from the OEFA Peru data source for all specified stations within a given time range.
 *
 * @param {Object} source An object containing configuration details for the data source
 * @param {Function} cb A callback function to pass the fetched data
 */
export async function fetchData (source, cb) {
  try {
		// because we have do not have the ability to query the api
		// to see how many stations we have we will create them this way
		// the station count will be stored in the source config
		let n = source.stationCount || 1;
    let stationIds = [...Array(n).keys()].map(i => i + 1);
    log.debug(`Fetching data for station ids up to ${n}`);

		// we should migrate to using from/to to be consistent with our other services
	  // once we make those changes this will act as a default
    // Peru OEFA API requires the date string formatted as 'yyyy-MM-dd'
		if(!source.from) {
				source.from = hourUTC(-4).toFormat('yyyy-MM-dd');
		}
		if(!source.to) {
				source.to = hourUTC().toFormat('yyyy-MM-dd');
		}

    const postResponses = stationIds.map(id =>createRequest(id, source));

    const results = await Promise.all(postResponses);

    let allMeasurements = [];
    results.forEach((result) => {
      if (result) {
        const measurements = formatData(result);
        allMeasurements = allMeasurements.concat(measurements);
      }
    });

    log.debug('All measurements:', allMeasurements);
    console.log('All measurements:', allMeasurements);
    
    cb(null, { name: 'unused', measurements: allMeasurements });
  } catch (error) {
    cb(error);
  }
}

/**
 * Transforms raw data from the OEFA Peru API response into a standardized format
 *
 * @param {Object} data A single station's latest data object received from the OEFA Peru API, containing
 * pollutant levels, station information, and a timestamp.
 * @returns {Array} An array of objects, each representing a formatted measurement
 */
function formatData (data) {
  let measurements = [];
  
  data.allDataObjects.forEach((dataObject) => {
    const { coordinates, date } = dataObject;
    const formattedDate = date.replace(' ', 'T').replace(' UTC', 'Z');
    const dateLuxon = DateTime.fromISO(formattedDate);
    pollutants.forEach((pollutant) => {
      if (dataObject.hasOwnProperty(pollutant)) {
        const value = dataObject[pollutant];
        if (value !== null) {
          measurements.push({
            date: {
              utc: dateLuxon.toUTC().toISO({ suppressMilliseconds: true}),
              local: dateLuxon.setZone('America/Lima').toISO({ suppressMilliseconds: true}),
            },
            location: dataObject.station,
            city: dataObject.district,
            coordinates: {
              latitude: parseFloat(coordinates.latitude),
              longitude: parseFloat(coordinates.longitude),
            },
            parameter: pollutant,
            value: parseFloat(value),
            unit: 'µg/m³',
            averagingPeriod: { unit: 'minutes', value: 5 },
            attribution: [{ name: 'OEFA', url: 'https://www.gob.pe/oefa' }],
          });
        }
      }
    });
  });
  
  return measurements;
}

/**
 * Asynchronously sends a request to the OEFA Peru API for air quality data
 *
 * @param {Number} idStation The ID of the station for which data is being requested.
 * @param {Object} source An object containing configuration details for the data source
 * @returns {Promise<Object|null>} A promise that resolves to an object containing the station ID and the latest data object, or null if no data is available
 */
async function createRequest(idStation, source) {
		const body = {
				user: source.credentials.user,
				password: source.credentials.password,
				startDate: source.from,
				endDate: source.to,
				idStation: idStation.toString()
		};

		try {

				const response = await client({
            url: source.url,
						params: body,
						as: 'json',
            method: 'POST',
				});

				if (response.status === "3") {
						throw new FetchError(AUTHENTICATION_ERROR, source, response.message);
				} else if(response.status !== "1") {
						throw new FetchError(FETCHER_ERROR, source, response.message);
				}

				if (!response.data || response.data.length === 0) {
						log.debug(`No data for station ID ${idStation} / ${response.status} / ${response.message}`);
						return null;
				} else {
						return {
								idStation,
                allDataObjects: response.data,

						};
				}
		} catch (error) {
				if (error instanceof FetchError) {
						throw error;
				} else {
						throw new FetchError(FETCHER_ERROR, source, error.message);
				}
		}
}
