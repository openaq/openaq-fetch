'use strict';

import log from '../lib/logger.js';
import client from '../lib/requests.js';
import { parseTimestamp, parseCoordinates } from '../lib/utils.js';

// EPSG:3857 is the Coordinate Reference System (Web Mercator Projection)
const crs = 'EPSG:3857';

export const name = 'eea-utdviewer';

export const parameters = {
    'CO': { name: 'co', unit: 'mg/m3' },
    'NO2': { name: 'no2', unit: 'ug/m3' },
    'O3': { name: 'o3', unit: 'ug/m3' },
    'PM10': { name: 'pm10', unit: 'ug/m3' },
    'PM25': { name: 'pm25', unit: 'ug/m3' },
    'SO2': { name: 'so2', unit: 'ug/m3' }
};

/**
 * Constructs a URL for fetching air quality data from the EEA UTD Viewer API.
 * 
 * @param {string} parameter - The air quality parameter to query.
 * @param {string} timestamp - The timestamp for the data request in a specific format.
 * @return {string} The constructed URL for the API request.
 */
function buildUrl(parameter, timestamp) {
    // make sure paramter is all caps
    // fix format of the timestamp
    return `https://discomap.eea.europa.eu/Map/UTDViewer/dataService/Hourly?polu=${parameter.toUpperCase()}&dt=${timestamp}`;
};

/**
 * Fetches air quality data for all defined pollutants at a specific datetime and formats it
 * 
 * @param {string} source - The data source identifier (unused in the current implementation).
 * @param {Function} cb - Callback function to return the data or an error.
 * @return {Promise<void>} A promise that resolves when data fetching and processing is complete.
 */
export async function fetchData(source, cb) {
    const measurements = [];
    const datetime = '20240320130000';
    // for each parameter we need to do a new call
    const data = await Promise.all(Object.keys(parameters).map( async param => {
        // try each parameter in an error block
        const dta  = await fetchParameter(param, datetime);
        log.debug('First record', dta[0]);
        return dta;
    })).then( d => {
        return d.flat();
    }).catch( err => {
        // if we get an error here we ignore it
        log.error('Error fetching data', err.message);
    });


    // now we can loop through each record format it, and add it to the measurements
    data
    .splice(0,10) // for testing
    .map( d => {
        try {
            measurements.push(formatData(d));
        } catch (err) {
            // if the data is bad and cant be a measurement we throw an error
            // bug again, we ignore it and move on
            log.error('Error formating data', err.message, d);
        }
    });

    return cb(null, { measurements });
}

/**
 * Fetches and returns air quality data for a specific parameter and timestamp.
 * 
 * @param {string} param - The pollutant parameter to fetch.
 * @param {string} timestamp - The timestamp for which to fetch the data.
 * @return {Promise<Object[]>} A promise that resolves to an array of data points.
 */
async function fetchParameter(param, timestamp) {
    const url = buildUrl(param, timestamp);
    return await client({ url, as: 'csv' });
}

/**
 * Formats a single data record from the air quality data service into a structured object.
 * 
 * @param {Object} d - The data record to format.
 * @return {Object} A formatted data object including location, value, parameter, and other relevant information.
 * @throws {Error} If the data cannot be correctly parsed or is missing required fields.
 */
function formatData(d) {
    const location = d.STATIONNAME;
    const sourceId = d.STATIONCODE;
    const param = d.PROPERTY;
    const value = parseFloat(d.VALUE_NUMERIC);
    const coordinates = parseCoordinates(d.LATITUDE, d.LONGITUDE, crs);
    const date = parseTimestamp(d.DATETIME_END, 'yyyyMMddHHmmss', 'utc');

    // check the date
    if(!date.utc) {
        throw new Error(`Could not parse timestamp - ${d.DATETIME_END}`);
    }
    // check for a value, zeros are fine
    if(value === null || value === undefined) {
        throw new Error(`Missing value (${value})`);
    }
    // make sure we have the parameter info
    if(!Object.keys(parameters).includes(param)) {
        throw new Error(`Parameter not found (${param})`);
    }

    return {
        date,
        value,
        location,
        sourceId,
        locationType: `${d.AREACLASSIFICATION} - ${d.STATIONCLASSIFICATION}`, // done care if its missing
        city: d.MUNICIPALITY, // dont care if we dont have it
        parameter: parameters[param].name,
        unit: parameters[param].unit,
        averagingPeriod: { value: 1, unit: 'hours' },
        sourceType: "government",
        mobile: false,
        attribution: [
            {
                name: 'European Environment Agency',
                url: 'https://www.eea.europa.eu/data-and-maps/explore-interactive-maps/up-to-date-air-quality-data',
            },
        ],
        coordinates,
    };

}
