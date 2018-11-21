'use strict';

export const notEmpty = x => x;
export const ignore = () => 0;

/**
 * Legacy adapter compatibility method, not needed anymore.
 * @param {*} input
 */
export function convertUnits (input) { return input; }

/**
 * Convert units into system-preferred units.
 *
 *
 *
 * @summary The preferred unit for mass concentration is 'µg/m3', for volumetric
 * concentrations this is 'ppm'.
 * @param {Array} measurements An array of measurements to potentially convert units of
 * @return {Array} An array of measurements converted to system-preferred units
 */
export function unifyMeasurementUnits (m) {
  if (!m || typeof m.unit !== 'string' || isNaN(+m.value)) return;

  m.unit = m.unit && m.unit.toLowerCase();

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
    case 'µg/m3':
    case 'ug/m3':
    case 'µg/m³':
    case 'ug/m³':
      m.unit = 'µg/m³';
      break;
    case 'mg/m3':
    case 'mg/m³':
      m.value = m.value * 1000;
      m.unit = 'µg/m³';
      break;
  }

  return m;
}

export function unifyParameters (m) {
  if (m && typeof m.parameter === 'string') {
    m.parameter = m.parameter.toLowerCase().replace('.', '');
  }

  return m;
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

export async function defer (timeout = 0) {
  return new Promise(resolve => {
    if (timeout > 0) return setTimeout(resolve, timeout);

    return setImmediate(resolve);
  });
}

export function removeUnwantedParameters (measurements) {
  return measurements.filter(({parameter}) => acceptableParameters.includes(parameter));
}

// The platform supported parameters
export const acceptableParameters = ['pm25', 'pm10', 'co', 'so2', 'no2', 'bc', 'o3'];
