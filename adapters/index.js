module.exports = require('require-dir')();

/**
 *
 * Expected data format from the adpater is like below
 * {
 *   "name": "Source Name",
 *   "measurements": [
 *      { parameter: 'pm10',
 *        date: {
 *           utc: Thu Jul 23 2015 06:40:00 GMT-0400 (EDT),
 *           local: '2015-07-23T07:40:00-03:00'
 *         },
 *        coordinates: {
 *          latitude: 45,
 *          longitude: 40
 *        },
 *        value: 63,
 *        unit: 'µg/m3' },
 *     { parameter: 'pm25',
 *        date: {
 *           utc: Thu Jul 23 2015 06:40:00 GMT-0400 (EDT),
 *           local: '2015-07-23T07:40:00-03:00'
 *         },
 *        coordinates: {
 *          latitude: 45,
 *          longitude: 40
 *        },
 *        value: 26,
 *        unit: 'µg/m3' }
 *   ]
 * }
 *
 * Valid parameter values are pm25, pm10, so2, no2, co, o3, and bc (black carbon).
 * All other values will be ignored.
 *
 * Date should be provided as UTC and local. moment.js can be used to handle time zone
 * conversions. List of valid zone names at
 * https://en.wikipedia.org/wiki/List_of_tz_database_time_zones.
 */
