import client from '../lib/requests.js';
import { DateTime } from 'luxon';
import { load } from 'cheerio';
import Bottleneck from 'bottleneck';

import log from '../lib/logger.js';

export const name = 'southkorea';

const paramsUnits = {
  10008: { name: "PM2.5", unit: "µg/m³" },
  10007: { name: "PM10", unit: "µg/m³" },
  10003: { name: "O3", unit: "ppm" },
  10006: { name: "NO2", unit: "ppm" },
  10002: { name: "CO", unit: "ppm" },
  10001: { name: "SO2", unit: "ppm" }
};

export async function fetchData(source, cb) {
  const limiter = new Bottleneck({
    maxConcurrent: 32,
    minTime: 100
  });

  const fetchDataForCode = async (itemCode) => {
    const stations = await fetchStationList(itemCode);
    const fetchDetails = limiter.wrap(async (station) => {
      const url = `${source.url}/vicinityStation?item_code=${itemCode}&station_code=${station.STATION_CODE}`;
      log.debug(url)
      try {
        const response = await client(url, { responseType: 'text' });
        const $ = load(response.body);
        const concentrationText = $('tr.al2').filter(function() {
          return $(this).find('th').text().trim() === 'concentration';
        }).find('td').text().trim();
      
      const measurementValue = parseFloat(concentrationText.split(' ')[0]);
      
        return { ...station, measurementValue };
      } catch (error) {
        log.error(`Error fetching details for station ${station.STATION_CODE}:`, error.message);
      }
    });

    const detailsPromises = stations.map(station => fetchDetails(station));
    const stationsWithDetails = (await Promise.all(detailsPromises)).filter(Boolean);
    return formatData(stationsWithDetails, itemCode);
  };

  try {
    const results = await Promise.allSettled(Object.keys(paramsUnits).map(fetchDataForCode));
    const successfulResults = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value);
    cb(null, successfulResults);
  } catch (error) {
    log.error('Error in fetchData:', error.message);
    cb(error, null);
  }
}

async function fetchStationList(source, itemCode) {
  const options = {
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      pragma: "no-cache",
    },
    body: `itemCode=${itemCode}`,
    method: "POST",
    responseType: 'json',
  };

  try {
    const response = await client(source.url, options);
    return response.body.list.map(station => ({
      ...station,
      ...paramsUnits[itemCode]
    }));
  } catch (error) {
    console.error('Error:', error);
    throw error; 
  }
}

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
