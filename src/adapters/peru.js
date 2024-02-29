/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the OEFA Peru data source.
 */

import got from 'got';
import { DateTime } from 'luxon';
import log from '../lib/logger.js';

import {
  FetchError,
  AUTHENTICATION_ERROR,
  DATA_PARSE_ERROR,
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
		if(!source.from) {
				source.from = DateTime.utc().toISODate();
		}
		if(!source.to) {
				source.to = DateTime.utc().toISODate();
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
    cb(null, { name: 'unused', measurements: allMeasurements });
  } catch (error) {
    cb(error);
  }
}

function formatData (data) {
  const measurements = [];

  const { coordinates, date } = data.lastDataObject;
  const formattedDate = date.replace(' ', 'T').replace(' UTC', 'Z');
  const dateLuxon = DateTime.fromISO(formattedDate);

  pollutants.forEach((pollutant) => {
    if (data.lastDataObject.hasOwnProperty(pollutant)) {
      const value = data.lastDataObject[pollutant];
      if (value !== null) {
        measurements.push({
          date: {
            utc: dateLuxon.toUTC().toISO({ suppressMilliseconds: true}),
            local: dateLuxon.setZone('America/Lima').toISO({ suppressMilliseconds: true}),
          },
          location: data.lastDataObject.station,
          city: data.lastDataObject.district,
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
  return measurements;
}



async function createRequest(idStation, source) {
		const body = {
				user: source.user,
				password: source.password,
				startDate: source.from,
				endDate: source.to,
				idStation: idStation.toString()
		};

		try {
				log.debug(`Sending request for station ID: ${idStation} (${source.from} - ${source.to}) to ${source.url}`);
				const response = await got.post(source.url, {
						json: body,
						responseType: 'json',
				});

				//console.log(response)
				// Check if response body 'status' is not "1"; ie user or password is incorrect
				if (response.body.status !== "1") {
						throw new FetchError(AUTHENTICATION_ERROR, source, response.body.message);
						//throw new Error(`API Error for station ID ${idStation}: ${response.body.message || 'Unknown error'}`);
				}

				if (!response.body.data || response.body.data.length === 0) {
						log.debug(`No data for station ID ${idStation}`);
						return null;
				} else {
						return {
								idStation,
								lastDataObject: response.body.data[response.body.data.length - 1],
						};
				}
		} catch (error) {
				log.error(
						`Request failed for station ID ${idStation}:`,
						error.response ? error.response.body : error.message
				);
				throw error;
		}
}
