'use strict';

import { default as moment } from 'moment-timezone';
import { acceptableParameters, promiseRequest } from '../lib/utils';
import { parsed } from 'yargs';

export const name = 'rio';

export async function fetchData(source, cb) {
  try {
    const allData = JSON.parse(await promiseRequest(source.url));
    return parseData(allData.features);
  } catch (e) {
    cb(e);
  }
}

function parseData(measurements) {
  const flattened = measurements.map(m => m.attributes);
  const allData = []

  flattened.forEach(m => {
    const parsedData = [];

    const dateStr = moment.tz(latestM.endtime, 'Brasilia');
    const date = {
      utc: dateStr.toDate(), // 2020-01-03T04:00:00.000Z
      local: dateStr.format('YYYY-MM-DDTHH:mm:ssZ') // '2020-01-03T04:00:00+00:00'
    }

    const baseDataObj = {
      "date": date,
      "coordinates": { "latitude": m["Lat"], "longitude": m["Lon"] },
      "location": m["Estação"],
      "city": "Rio de Janeiro",
      "country": "BR",
      "averagingPeriod": { "value": 1, "unit": "hours" },
      "attribution": [{ "name": "Data.rio", "url": "http://www.data.rio/" }],
      "sourceName": "x", // ID to track measurement to source within the platform
      "sourceType": "research",
      "mobile": false,
    }

    const validParams = Object.keys(m).filter(p => acceptableParameters.includes(p.toLowerCase().replace('_', '')));
    validParams.each(p => {
      if (m[p] !== null) {
        const dataObj = JSON.parse(JSON.stringify(baseDataObj)); // Duplicate baseDataObj
        dataObj.parameter = p;
        dataObj.value = m[p];
        dataObj.unit = "unit"; // TODO
        parsed.push(dataObj);
      }
    })

    allData.concat(parsedData);
  })

  return parsed;
}
