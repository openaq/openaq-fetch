import {FetchError, DATA_URL_ERROR} from '../lib/errors';
import log from '../lib/logger';
import client from '../lib/requests.js';

function extractItemType (item) {
  return Object.getPrototypeOf(item).name || typeof item;
}

// export the name of the adapter
// all lowercase, dashes, numbers and no spaces
export const name = 'example';
// provide a parameter map that switches from theirs to ours
// feel free to use this object to do more (e.g. trinidadtobago)
// but it should at the least match their parameter to our name and units
export const parameters = {
    'CO': { name: 'co', unit: 'mg/m3' },
    'NO2': { name: 'no2', unit: 'ug/m3' },
    'O3': { name: 'o3', unit: 'ug/m3' },
    'PM10': { name: 'pm10', unit: 'ug/m3' },
    'PM25': { name: 'pm25', unit: 'ug/m3' },
    'SO2': { name: 'so2', unit: 'ug/m3' }
};
// Include any urls at the top
const url = "https://example.com";

// split the code into basic tasks

// fetchData
// main function that is exported to get the data
// loop through that data and pass each row for formatting
// return to collector


// fetchStations (optional)
// if something is needed to get stations we start there

// fetchMeasurements (probably required)
// We should have a function that returns the measurement data
// If it only takes one call to get all the data (for all stations and parameters)
// Then I would expect a function that made that call and then looped through
// each measurement and passed that data to the format data method
// If it takes one call per station (all parameters together)
// I would explect a loop through stations at a higher level (e.g. fetchData)
// that calls the fetchMeasurements

// formatData
// for each row of data (not for the whole data object)
// update parameter name
// check for errors






export function fetchStream (source) {
  if (source.data) {
    if (!Array.isArray(source.data)) throw source.data;

    const ret = function * () {
      try {
        for (let item of source.data) {
          log.verbose(`Handling measurement of type ${extractItemType(item)}`);

          if (item instanceof Error) yield Promise.reject(item);
          else yield item;
        }
      } catch (e) {}
    };

    return ret;
  }

  throw new FetchError(DATA_URL_ERROR);
}
