'use strict';

import { default as moment } from 'moment-timezone';
import { acceptableParameters, promiseRequest } from '../lib/utils';

export const name = 'rio';

export async function fetchData(source, cb) {
  try {
    const allData = JSON.parse(await promiseRequest(source.url));
    const parsedData = parseData(allData.features);
    cb(null, { name: 'unused', measurements: parsedData });
  } catch (e) {
    cb(e);
  }
}

/**
 * Flatten object returned by endpoint containing array of objects,
 * each with multiple parameter measurements.
 * Return array with the measurements logged in the last 31 days for valid parameters only.
 *
 * @param {object} params Data object returned from endpoint
 *
 * @example parseParams({
 *    "objectIdFieldName":"OBJECTID",
 *    "uniqueIdField": {...},
 *    "globalIdFieldName":"",
 *    "fields":[...],
 *    "features":[
 *      { "attributes":
 *        {
 *          "Data": 1325377800000,
 *          "Estação":"BG",
 *          "SO2":null,
 *          "NO2":15.18,
 *          "CO":0.42,
 *          "O3":28.06,
 *          "PM10":81,
 *          "PM2_5":null,
 *          "Lat":-22,
 *          "Lon":-43,
 *        }
 *      },
 *      ...
 *    ]
 * })
 *
 * @returns [ {
    "date": { utc: 2020-01-03T04:00:00.000Z, local: YYYY-MM-DDTHH:mm:ssZ },
    "coordinates": { "latitude": -22, "longitude": -43 },
    "location": "BG",
    "city": "Rio de Janeiro",
    "country": "BR","no2"
    "parameter": parameter,
    "value": 15.18,
    "unit": ppm,
    "averagingPeriod": { "value": 1, "unit": "hours" },
    "attribution": [{ "name": "Data.rio", "url": "http://www.data.rio/" }],
    "sourceName": "x",
    "sourceType": "government",
    "mobile": false,
  }]
 */

function parseData(measurements) {
  const flattened = measurements.map(m => m.attributes);
  let allData = [];

  flattened.forEach(measurement => {
    /**
     * @example measurement: {
     *    "Data": 1325377800000, // Date
     *    "Estação":"BG", // Station
     *    "SO2":null,
     *    "NO2":15.18,
     *    "CO":0.42,
     *    "O3":28.06,
     *    "PM10":81,
     *    "PM2_5":null,
     *    "Lat":-22.88790959,
     *    "Lon":-43.47107415,
     *  }
    */
    const parsedData = [];

    const utcDate = moment.utc(measurement.Data);
    const date = {
      utc: utcDate.format(), // 2020-01-03T04:00:00.000Z
      local: utcDate.tz("America/Sao_Paulo").format('YYYY-MM-DDTHH:mm:ssZ') // '2020-01-03T04:00:00+00:00'
    }

    // All acceptable parameters in the current measurement
    const validParams = Object.keys(measurement).filter(
      param => acceptableParameters.includes(param.toLowerCase().replace('_', ''))
    );

    validParams.forEach(param => {
      const value = measurement[param];
      if (value !== null) {
        const datapoint = getDataObj(date, measurement, param);
        parsedData.push(datapoint);
      }
    })

    allData = allData.concat(parsedData);
  })

  return allData;
}

function getDataObj(date, measurement, parameter) {
  const formattedParam = parameter.toLowerCase().replace("_", "");
  return {
    date: date,
    coordinates: { latitude: measurement.Lat, longitude: measurement.Lon },
    location: measurement.Estação,
    city: "Rio de Janeiro",
    country: "BR",
    parameter: formattedParam,
    unit: (parameter === "CO" ? "µg/m3" : "ppm"),
    value: measurement[parameter],
    averagingPeriod: { value: 1, unit: "hours" },
    attribution: [{ name: "Data.rio", url: "http://www.data.rio/" }],
    sourceName: "Prefeitura da Cidade do Rio de Janeiro – MonitorAr",
    sourceType: "government",
    mobile: false,
  }
}
