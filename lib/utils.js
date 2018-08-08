'use strict';

import { filter, countBy } from 'lodash';
let validate = require('jsonschema').validate;
let measurementSchema = require('./measurement-schema');
let dataSchema = require('./data-schema');

/**
 * Make sure that the data format is what the platform is expecting.
 * @param {object} data A valid data object containing measurements
 * @return {boolean} An indicator of whether the data is valid
 */
export function verifyDataFormat (data) {
  if (!data || data === {}) {
    let isValid = false;
    let failures = {'no data provided': 1};
    return { isValid, failures };
  }
  let v = validate(data, dataSchema);
  let isValid = v.errors.length === 0;
  let failures = [];
  v.errors.forEach((e) => {
    failures.push(e.stack);
  });

  return { isValid, failures };
}

/**
 * Prune measurements that don't meet our requirements.
 * @param {array} measurements The measurements array to prune measurements from
 * @return { pruned, failures } An array pruned of invalid measurement objects,
 * may be empty and a failures object of aggregated reasons for data failures
 */
export function pruneMeasurements (measurements) {
  let failures = [];
  let pruned = filter(measurements, function (m) {
    let v = validate(m, measurementSchema);
    v.errors.forEach((e) => {
      failures.push(e.stack);
    });

    // Return false if anything failed
    if (v.errors.length >= 1) {
      return false;
    }

    return true;
  });

  // Aggregate failures
  failures = countBy(failures);

  return { pruned, failures };
}

/**
 * Removes unwanted measurement types by parameters
 * @param {array} measurements An array of measurements to remove unwanted
 * paramters from.
 * @return An array of measurements of desired paramters
 */
export const removeUnwantedParameters = ({pm25, pm10, no2, so2, o3, co, bc}) => ({pm25, pm10, no2, so2, o3, co, bc});

/**
 * Convert units into system-preferred units.
 * @summary The preferred unit for mass concentration is 'µg/m3', for volumetric
 * concentrations this is 'ppm'.
 * @param {Array} measurements An array of measurements to potentially convert units of
 * @return {Array} An array of measurements converted to system-preferred units
 */
export function convertUnits (array) {
  array.forEach(unifyMeasurementUnits);
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
