import { REQUEST_TIMEOUT } from '../lib/constants.js';
import log from '../lib/logger.js';

import puppeteer from 'puppeteer';
import { DateTime } from 'luxon';
import got from 'got';

const bearerAuth = await getBearerAuth().then(
  (bearerAuth) => bearerAuth
);

const STATIONS_URL =
  'https://arpabaegis.arpab.it/Datascape/v3/locations?category=All&basin_org_id&basin_id&region_id&province_id&station_id&filter_central_id&filter_id&_=1677195752467';

const HEADERS = {
  authorization: bearerAuth,
  'accept-language': 'en-US,en;q=0.9',
  accept: '*/*',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'sec-ch-ua':
    '"Not_A Brand";v="99", "Google Chrome";v="109", "Chromium";v="109"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-requested-with': 'XMLHttpRequest',
  Referer: 'https://arpabaegis.arpab.it/aegis/map/map2d',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const getter = got.extend({
  retry: { limit: 3 },
  timeout: { request: REQUEST_TIMEOUT },
  method: 'GET',
  headers: HEADERS,
});

export const name = 'basilicata';

export async function fetchData(source, cb) {
  try {
    let stations = await fetchStations();

    let requests = stations.map(async (station) => {
      if (station.hasOwnProperty('i')) {
        const stationId = station.i;
        const url = `${source.url}${stationId}&longitude&latitude&category=1&ui_culture=en&field=ElementName&field=Time&field=Value&field=Decimals&field=MeasUnit&field=Trend&field=StateId&field=IsQueryable&filter_central_id&filter_id&_=`;
        try {
          const response = await getter(url);
          const data = JSON.parse(response.body);
          // Add fetched data to station object
          station.data = data;
          return station;
        } catch (error) {
          log.error(
            `Failed to fetch data for station: ${stationId}. Error: ${error}`
          );
          return null;
        }
      }
    });

    let stationData = await Promise.all(requests);
    stationData = stationData.filter(station => station !== null); // remove any failed requests

    let formattedData = formatData(stationData);
    // Filter the data and replace 'parameter' with value from 'translations'
    let translatedData = formattedData
      .filter((measurement) =>
        translations.hasOwnProperty(measurement.parameter)
      )
      .map((measurement) => {
        measurement.parameter = translations[measurement.parameter];
        return measurement;
      });

    cb(null, { name: 'unused', measurements: translatedData });
  } catch (error) {
    log.error(`Failed to fetch data. Error: ${error}`);
    cb(error);
  }
}

async function fetchStations() {
  try {
    const response = await getter(STATIONS_URL);
    const data = JSON.parse(response.body);
    return data;
  } catch (error) {
    log.error(`Failed to fetch stations. Error: ${error}`);
    throw error;
  }
}

function formatData(stationData) {
  const formattedData = [];

  stationData.forEach((station) => {
    const {
      n: location,
      x: longitude,
      y: latitude,
    } = station;

    station.data.forEach((data) => {
      const dt = DateTime.fromISO(data.time, { setZone: true });

      if (data.time && data.value) {
        const formattedMeasurement = {
          location,
          city: ' ',
          parameter: data.elementName,
          value: data.value,
          unit: data.measUnit,
          date: {
            utc: dt.toUTC().toISO({ suppressMilliseconds: true }),
            local: dt.toISO({ suppressMilliseconds: true }),
          },
          coordinates: {
            longitude,
            latitude,
          },
          averagingPeriod: { unit: 'hours', value: 1 },
          attribution: [
            {
              name: 'arpa-basilicata',
              url: 'https://arpabaegis.arpab.it',
            },
          ]
        };
        formattedData.push(formattedMeasurement);
      }
    });
  });

  return formattedData;
}

async function getBearerAuth() {
  let auth;
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://arpabaegis.arpab.it');

  page.on('request', (request) => {
    const headers = request.headers();
    if ('authorization' in headers) {
      auth = headers['authorization'];
    }
  });

  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  await browser.close();

  return auth;
}

let translations = { // other values are from the same locations
  'PM2.5, particolato_val': 'pm25',
  'PM10, particolato_val': 'pm10',
  // 'PM10, particulate material fr': 'pm10',
  // 'Monossido di carbonio': 'co',
  'Monossido di carbonio_val': 'co',
  // 'SO2, biossido di zolfo': 'so2',
  'SO2, biossido di zolfo_val': 'so2',
  // 'NO2, biossido di azoto': 'no2',
  'NO2, biossido di azoto_val': 'no2',
  // 'O3, ozono': 'o3',
  'O3, ozono_val': 'o3',
  // 'NO, monossido di azoto': 'no',
  'NO, monossido di azoto_val': 'no',
  // 'NOx, ossidi di azoto': 'nox',
  'NOx, nitrogen oxides_val': 'nox',
};
