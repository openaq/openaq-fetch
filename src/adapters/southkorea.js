import Bottleneck from 'bottleneck';
import { DateTime } from 'luxon';

import { FetchError, DATA_URL_ERROR } from '../lib/errors.js';
import client from '../lib/requests.js';
import log from '../lib/logger.js';

// maximum number of concurrent requests to make to the API.
const maxConcurrent = 32;

const stationsUrl = 'https://www.airkorea.or.kr/web/mRealAirInfoAjax';

const paramCodes = {
    10008: { name: 'PM2.5', unit: 'µg/m³' },
    10007: { name: "PM10", unit: "µg/m³" },
    10003: { name: "O3", unit: "ppm" },
    10006: { name: "NO2", unit: "ppm" },
    10002: { name: "CO", unit: "ppm" },
    10001: { name: "SO2", unit: "ppm" }
};

export const name = 'southkorea';

/**
 * A rate limiter to control the frequency of API requests, configured to allow a maximum
 * number of concurrent requests and to enforce a minimum delay between requests.
 */
const limiter = new Bottleneck({
    maxConcurrent: maxConcurrent,
    minTime: 50,
});

export async function fetchData(source, cb) {
    try {
        const results = await Promise.all(
            Object.keys(paramCodes).map(fetchDataByCode)
        );
        const measurements = results.flat();
        log.debug('measurements:', measurements.length && measurements[0]);
        cb(null, { name: 'unused', measurements });
    } catch (error) {
        log.error('Error in fetchData:', error.message);
        cb(error, null);
    }
}

/**
 * @param {number} paramCode - The parameter code representing a specific air pollutant.
 * @returns {Promise<Array>} A promise that resolves to an array of formatted station data with measurements.
 */
async function fetchDataByCode(paramCode) {
    const stations = await fetchStations(paramCode);
    const formattedStations = stations
        // .slice(0, 10) // for testing
        .map(station => formatData(station, paramCode))
        .filter(station => station.value !== null);
    return formattedStations;
}

/**
 * @param {number} paramCode - The parameter code for the pollutant being measured.
 * @returns {Promise<Array>} - A promise that resolves to an array of objects, each representing a station and its details.
 */
async function fetchStations(paramCode) {
    const headers = {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        pragma: 'no-cache',
    };

    try {
        const params = { itemCode: paramCode };
        const data = await client({ url: stationsUrl, headers, method: 'GET', params });
        return data.list.map((station) => ({
            ...station,
            ...paramCodes[paramCode],
        }));
    } catch (error) {
        log.error('Error: fetchStations', error.message);
        throw error;
    }
}

/**
 * @param {Object} station - An object containing a station's details and its measurement value.
 * @param {number} paramCode - The parameter code for the pollutant measured at the station.
 * @returns {Object} - An object containing formatted air quality data for the station.
 */
function formatData(station, paramCode) {
    const dateTime = DateTime.fromFormat(
        station.ENG_DATA_TIME,
        'yyyy-MM-dd : HH',
        { zone: 'Asia/Seoul' }
    );

    let value = parseFloat(station.VALUE);
    if(isNaN(value)) value = 9999;

    return {
        location: station.STATION_NAME,
        city: '',
        coordinates: {
            latitude: parseFloat(station.DM_Y),
            longitude: parseFloat(station.DM_X),
        },
        parameter: station.name.toLowerCase().replace('.', ''),
        date: {
            utc: dateTime.toUTC().toISO({suppressMilliseconds: true}),
            local: dateTime.toISO({suppressMilliseconds: true}),
        },
        value: value,
        unit: paramCodes[paramCode].unit,
        attribution: [
            {
                name: 'Korea Air Quality Data',
                url: 'https://www.airkorea.or.kr/eng',
            },
        ],
        averagingPeriod: {
            unit: 'hours',
            value: 1,
        },
    };
}
