/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the South African data sources.
 *
 * SAAQIS (South African Air Quality Information System) runs Envitech
 * Envista Web. A platform upgrade removed the old public
 * /ajax/getAllStationsWithoutFiltering endpoint this adapter used to scrape,
 * which is why the source went stale in March 2024. The current portal
 * exposes an anonymous two-step flow instead:
 *
 *   1. POST {url}Account/GetApiFromBackToken -> { key, timeout } - a
 *      short-lived (30 min) key tied to the ASP.NET session cookie.
 *   2. POST {url}api with `Authorization: <key>` (same cookie jar) and a
 *      JSON body describing the inner Envista REST request, e.g.
 *      { url: 'regions', Method: 'GET', ... }.
 *
 * The proxied Envista responses ('regions', 'regions/data/latest') have
 * the same shapes consumed by the israel-envista adapter, so this
 * adapter follows its structure. No credentials are required.
 *
 * Data is fetched in a single bulk call
 * ('regions/data/latest?unitConversion=true&regionsIds=...&timebase=60')
 * rather than one request per station; unitConversion=true makes Envista
 * serve gas concentrations in ppm/ppb (notably converting the one CO
 * channel natively stored in mg/Nm3, a normalized-volume unit we could
 * not convert reliably ourselves).
 */

'use strict';

import log from '../lib/logger.js';
import client from '../lib/requests.js';

import { CookieJar } from 'tough-cookie';
import { DateTime } from 'luxon';
import {
  convertUnits,
  unifyMeasurementUnits,
  acceptableParameters,
} from '../lib/utils.js';

export const name = 'southafrica';

const TIMEZONE = 'Africa/Johannesburg';

// Ignore cert issues
const HTTPS_OPTIONS = { rejectUnauthorized: false };

/**
 * Fetches data from the SAAQIS Envista web API.
 * @param {Object} source - The source configuration object.
 * @param {Function} cb - The callback function to handle the fetched data.
 */
export async function fetchData(source, cb) {
  try {
    const session = await createSession(source);
    const regionList = await envistaGet(source, session, 'regions');

    // Station metadata (name, coordinates, region) only comes from the
    // regions listing, so index it by stationId for the bulk lookup.
    const stationsById = new Map();
    const regionIds = [];
    for (const region of regionList) {
      if (!region.stations || region.stations.length === 0) continue;
      regionIds.push(region.regionId);
      for (const station of region.stations) {
        if (station.active && hasAcceptedParameters(station)) {
          stationsById.set(station.stationId, {
            station,
            regionName: region.name,
          });
        }
      }
    }

    // One bulk call for the latest hourly reading of every station,
    // instead of ~200 per-station requests (which SAAQIS also times out
    // on under parallelism). Silent stations are simply absent here.
    const bulk = await envistaGet(
      source,
      session,
      `regions/data/latest?unitConversion=true&regionsIds=${regionIds.join(
        ','
      )}&timebase=60`
    );

    const flatResults = (bulk || [])
      .filter((entry) => entry.regionData && stationsById.has(entry.stationId))
      .flatMap((entry) => {
        const { station, regionName } = stationsById.get(entry.stationId);
        return formatData(source, regionName, station, {
          data: [entry.regionData],
        });
      });

    const convertedResults = convertUnits(flatResults);

    log.debug(`Example measurements: ${convertedResults.slice(0, 5)}.`);

    return cb(null, { name: 'unused', measurements: convertedResults });
  } catch (err) {
    log.error(`Error fetching data: ${err.message}`);
    return cb({ message: 'Failure to load data url.' });
  }
}

/**
 * Creates an anonymous SAAQIS API session: the token from
 * Account/GetApiFromBackToken is only valid together with the session
 * cookie issued alongside it, so the same cookie jar must be used for
 * every subsequent request.
 * @param {Object} source - The source configuration object.
 * @returns {Promise<Object>} A promise resolving to { cookieJar, key }.
 */
async function createSession(source) {
  const cookieJar = new CookieJar();
  const response = await client({
    url: `${source.url}Account/GetApiFromBackToken`,
    method: 'POST',
    params: {},
    cookieJar,
    https: HTTPS_OPTIONS,
  });
  if (!response || !response.key) {
    throw new Error('SAAQIS did not issue an API token');
  }
  return { cookieJar, key: response.key };
}

/**
 * Performs a GET request against the Envista REST API via the SAAQIS
 * /api proxy endpoint.
 * @param {Object} source - The source configuration object.
 * @param {Object} session - The session object from createSession.
 * @param {string} path - The inner Envista path, e.g. 'regions'.
 * @returns {Promise<*>} A promise resolving to the proxied response.
 */
async function envistaGet(source, session, path) {
  return client({
    url: `${source.url}api`,
    method: 'POST',
    cookieJar: session.cookieJar,
    https: HTTPS_OPTIONS,
    headers: {
      Authorization: session.key,
      Referer: source.url,
    },
    params: {
      url: path,
      includeEnvistaPrefix: true,
      header: { Accept: 'application/json' },
      Method: 'GET',
      body: null,
      isMaintainView: false,
    },
  });
}

/**
 * Formats the data for a single station.
 * @param {Object} source - The source configuration object.
 * @param {string} regionName - The name of the region.
 * @param {Object} station - The station object.
 * @param {Object} data - The data object retrieved from the API.
 * @returns {Array} An array of formatted measurements.
 */
function formatData(source, regionName, station, data) {
  const base = {
    location: station.name,
    city: regionName,
    coordinates: {
      latitude: parseFloat(station.location.latitude),
      longitude: parseFloat(station.location.longitude),
    },
    averagingPeriod: { unit: 'hours', value: 1 },
    attribution: [
      {
        name: 'South African Air Quality Information System',
        url: source.sourceURL,
      },
    ],
  };

  const timeWindow = DateTime.utc().minus({ hours: 6 });

  const filteredData = (data.data || []).filter((datapoint) => {
    const measurementDateTime = DateTime.fromISO(datapoint.datetime);
    return measurementDateTime >= timeWindow;
  });

  return filteredData
    .map((datapoint) => formatChannels(base, datapoint))
    .flat()
    .filter((measurement) => measurement);
}

/**
 * Formats the channels for a single datapoint.
 * @param {Object} base - The base measurement object.
 * @param {Object} datapoint - The datapoint object.
 * @returns {Array} An array of formatted measurements.
 */
function formatChannels(base, datapoint) {
  const date = getDate(datapoint.datetime);

  return datapoint.channels
    .filter(
      (channel) =>
        channel.valid && isAcceptedParameter(channel.name)
    )
    .map((channel) => ({
      ...base,
      ...date,
      parameter: channel.name.toLowerCase().split('.').join(''),
      value: channel.value,
      unit: channel.units,
    }))
    .map(unifyMeasurementUnits)
    // unitConversion=true plus unifyMeasurementUnits should leave only
    // system units; guard against any residual exotic units regardless.
    .filter((m) => ['µg/m³', 'ppm', 'ppb'].includes(m.unit));
}

/**
 * Checks if a station has accepted parameters.
 * @param {Object} station - The station object.
 * @returns {boolean} True if the station has accepted parameters, false otherwise.
 */
function hasAcceptedParameters(station) {
  const stationParameters = (station.monitors || []).map((monitor) =>
    monitor.name.toLowerCase().split('.').join('')
  );
  return acceptableParameters.some((param) =>
    stationParameters.includes(param)
  );
}

/**
 * Checks if a parameter is accepted.
 * @param {string} parameter - The parameter to check.
 * @returns {boolean} True if the parameter is accepted, false otherwise.
 */
function isAcceptedParameter(parameter) {
  return acceptableParameters.includes(
    parameter.toLowerCase().split('.').join('')
  );
}

/**
 * Gets the date object from a datetime string.
 * @param {string} value - The datetime string.
 * @returns {Object} An object containing the UTC and local date strings.
 */
function getDate(value) {
  const dt = DateTime.fromISO(value, { zone: TIMEZONE });
  const utc = dt.toUTC().toISO({ suppressMilliseconds: true });
  const local = dt.toISO({ suppressMilliseconds: true });
  return { date: { utc, local } };
}
