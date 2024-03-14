import client from '../lib/requests.js';
import { DateTime } from 'luxon';
import { load } from 'cheerio';
import Bottleneck from 'bottleneck';

import { FetchError, DATA_URL_ERROR } from '../lib/errors.js';

import log from '../lib/logger.js';

export const name = 'southkorea';
export const url = "https://www.airkorea.or.kr/web/mRealAirInfoAjax";

const paramsUnits = {
  10008: { name: "PM2.5", unit: "µg/m³" },
  10007: { name: "PM10", unit: "µg/m³" },
  10003: { name: "O3", unit: "ppm" },
  10006: { name: "NO2", unit: "ppm" },
  10002: { name: "CO", unit: "ppm" },
  10001: { name: "SO2", unit: "ppm" }
};

// Readable code is extremely important - so super clear and concise and add notes where its not clear
// Be consistent with how you write functions (function vs const)
// make sure you are providing docstrings for function that explain what the args are
// do not create a function in a function unless you really have to, its very confusing to trace
// pass arguments to functions when possible intead of using variables from outside the functions scope (related to the function in a function issue)
// keep the important stuff on the top, like the export and the rest below, js doesnt care what order the functions are in

// Write a docstring here
export async function fetchData(source, cb) {
    try {
        const results = await Promise.allSettled(Object.keys(paramsUnits).map((code) => fetchDataForCode(code)));
        const successfulResults = results
              .filter(result => result.status === 'fulfilled')
              .flatMap(result => result.value);
        cb(null, successfulResults);
    } catch (error) {
        // All catastrophic errors should bubble up to here and then we pass them back
        // and here we can create a new error and pass it back
        // and we can rely on the error catcher further up the line to log it out
        // log.error('Error in fetchData:', error.message);
        cb(error, null);
    }
}

// Write a docstring here
// Name things better than this
// for example, if you call it `fetchDataByCode` make the argument `code`, not `itemCode`
// or if `itemCode` make the function `fetchDataByItemCode`
async function fetchDataForCode(itemCode) {
    const limiter = new Bottleneck({
        maxConcurrent: 32,
        minTime: 100
    });
    // first we get a list of stations
    const stations = await fetchStationList(itemCode);
    // then we pull details for each station
    const details = await Promise.all(stations.map(station => fetchDetails(itemCode, station)));
    //const detailsPromises = stations.map(station => limiter.wrap(() => fetchDetails(source, itemCode, station)));
    //const stationsWithDetails = (await Promise.all(detailsPromises)).filter(Boolean);
    return formatData(details, itemCode);
};

// Write a docstring here
async function fetchStationList(itemCode) {
  const params = `itemCode=${itemCode}`;
  try {
    const response = await client(url, null, 'POST', params);
    // Add something here to check the response before using it
    //log.debug(response.body)
    return response.body.list.map(station => ({
      ...station,
      ...paramsUnits[itemCode]
    }));
  } catch (error) {
      // Why are we catching an error here and then just throwing it again?
    console.error('Error:', error);
    throw error;
  }
}


// write a docstring here
async function fetchDetails (itemCode, station) {
    const detailsUrl = `${url}/vicinityStation?item_code=${itemCode}&station_code=${station.STATION_CODE}`;

    try {

        const response = await client(detailsUrl, null, 'POST', '', 'text');

        const $ = load(response.body);
        const concentrationText = $('tr.al2').filter(function() {
            return $(this).find('th').text().trim() === 'concentration';
        }).find('td').text().trim();

        const measurementValue = parseFloat(concentrationText.split(' ')[0]);

        return { ...station, measurementValue };
    } catch (error) {
        // only catch and rethrow if you are going to change the message or do something
        // otherwise just catch it somewhere else
        throw new Error(`fetchDetailsError: ${error.message}`);
    }
};



// Write a docstring here
function formatData (stations, itemCode) {
  return stations.map(station => {
    const dateTime = DateTime.fromFormat(station.ENG_DATA_TIME, 'yyyy-MM-dd : HH', { zone: 'UTC' });

    return {
      location: station.STATION_ADDR,
      city: " ",
      coordinates: {
        latitude: parseFloat(station.DM_Y),
        longitude: parseFloat(station.DM_X),
      },
      parameter: station.name.toLowerCase().replace('.', ''),
      date: {
        utc: dateTime.toISO(),
        local: dateTime.setZone('Asia/Seoul').toISO()
      },
      value: station.measurementValue,
      unit: paramsUnits[itemCode].unit,
      attribution: [{
        name: 'Korea Air Quality Data',
        url: "https://www.airkorea.or.kr/eng"
      }],
      averagingPeriod: {
        unit: 'hours',
        value: 1,
      },
    };
  });
}
