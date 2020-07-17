'use strict';

// TODO: fetch last month, units, sourceName, test!
import { default as moment } from 'moment-timezone';
import { acceptableParameters, promiseRequest } from '../lib/utils';

export const name = 'rio';

export async function fetchData(source, cb) {
  try {
    const allData = JSON.parse(await promiseRequest(source.url));
    return parseData(allData.features);
  } catch (e) {
    cb(e);
  }
}

/**
 * Flatten object returned by endpoint containing array of objects,
 * each with multiple parameter measurements.
 * Return array with the latest measurement for valid parameters only.
 *
 * @param {object} params Data object returned from endpoint
 *
 * @example parseParams({
 *    "objectIdFieldName":"OBJECTID",
 *    "uniqueIdField": {...},
 *    "globalIdFieldName":"",
 *    "fields":[...],
 *    "features":[
 *      {"attributes":
 *        {
 *          "OBJECTID":1,
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
  const allData = []

  flattened.forEach(measurement => {
    /**
     * @example measurement: {
     *    "OBJECTID":1,
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

    const dateStr = moment.tz(latestM.endtime, 'Brasilia');
    const date = {
      utc: dateStr.toDate(), // 2020-01-03T04:00:00.000Z
      local: dateStr.format('YYYY-MM-DDTHH:mm:ssZ') // '2020-01-03T04:00:00+00:00'
    }

    // All acceptable parameters in the current measurement
    const validParams = Object.keys(measurement).filter(
      p => acceptableParameters.includes(p.toLowerCase().replace('_', ''))
    );
    validParams.each(param => {
      const value = measurement[param];
      if (value !== null) {
        const datapoint = getDataObj(date, param, value)
        parsedData.push(datapoint);
      }
    })

    allData.concat(parsedData);
  })

  return allData;
}

function getDataObj(date, parameter, value) {
  const unit = ["ppm", "pphm", "ppb", "ppt", "µg/m3", "mg/m3"]

  return {
    "date": date,
    "coordinates": { "latitude": m["Lat"], "longitude": m["Lon"] },
    "location": m["Estação"],
    "city": "Rio de Janeiro",
    "country": "BR",
    "parameter": parameter,
    "value": value,
    "unit": unit,
    "averagingPeriod": { "value": 1, "unit": "hours" },
    "attribution": [{ "name": "Data.rio", "url": "http://www.data.rio/" }],
    "sourceName": "",
    "sourceType": "government",
    "mobile": false,
  }
}
