'use strict';

import { FetchError, STREAM_END } from './errors';

/**
 * Convert units into system-preferred units.
 * @summary The preferred unit for mass concentration is 'µg/m3', for volumetric
 * concentrations this is 'ppm'.
 * @param {Array} measurements An array of measurements to potentially convert units of
 * @return {Array} An array of measurements converted to system-preferred units
 */
export function convertUnits (array) {
  array.filter(x => x).forEach(unifyMeasurementUnits);
  return array;
}

export function unifyMeasurementUnits (m) {
  switch (m.unit) {
    case 'pphm':
      m.value = m.value / 100;
      m.unit = 'ppm';
      break;
    case 'ppb':
      m.value = m.value / 1000;
      m.unit = 'ppm';
      break;
    case 'ppt':
      m.value = m.value / 1000000;
      m.unit = 'ppm';
      break;
    case 'UG/M3':
    case 'µg/m3':
    case 'ug/m3':
      m.unit = 'µg/m³';
      break;
    case 'mg/m3':
    case 'mg/m³':
      m.value = m.value * 1000;
      m.unit = 'µg/m³';
      break;
  }
}

export function toTitleCase (str) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

/**
 * Safely parse JSON
 * @summary Try to safely parse JSON.
 * @param {string} string of JSON to parse
 * @return A JSON object or undefined
 */
export function safeParse (json) {
  let parsed;

  try {
    parsed = JSON.parse(json);
  } catch (e) {
    // Nothing needed here
  }

  return parsed;
}

// The platform supported parameters
export const acceptableParameters = ['pm25', 'pm10', 'co', 'so2', 'no2', 'bc', 'o3'];

export function removeUnwantedParameters (measurements) {
  return measurements.filter(({parameter}) => acceptableParameters.includes(parameter));
}

export function rejectOnTimeout (timeout, value) {
  return new Promise((resolve, reject) => setTimeout(() => reject(value), timeout));
}

export function resolveOnTimeout (timeout, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), timeout));
}

export async function handleProcessTimeout (processTimeout, runningSources, log) {
  await resolveOnTimeout(processTimeout);

  log.error('Uh oh, process timed out.');
  const unfinishedSources = Object.entries(runningSources)
    .filter(([, v]) => v !== 'finished' && v !== 'filtered')
    .map(([k]) => k);

  log.error(`Still running sources at time out: ${unfinishedSources}`);
  return 1;
}

export async function handleUnresolvedPromises (strict, log) {
  if (strict) {
    const e = await new Promise((resolve) => {
      process.on('unhandledRejection', e => resolve(e));
    });

    log && log.error('Unhandled promise rejection caught:', e.stack);
    throw e;
  } else {
    return new Promise(() => 0); // never resolve
  }
}

export function handleFetchErrors (log) {
  return (error) => {
    const cause = error instanceof FetchError ? error : error.cause;

    if (cause instanceof FetchError) {
      if (cause.is(STREAM_END)) return cause.exitCode || 0;
      log.error('Fetch error occurred', cause.stack);
    } else {
      log.error(`Runtime error occurred in ${error.stream && error.stream.name}: ${error.stack}`);
    }

    return (cause && cause.exitCode) || 100;
  };
}
