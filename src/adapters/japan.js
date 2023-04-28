/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Japan data source.
 */

'use strict';

import { acceptableParameters } from '../lib/utils.js';
import log from '../lib/logger.js';
import { DateTime } from 'luxon';
import { parse } from 'csv-parse';
import Bottleneck from 'bottleneck';
import got from 'got';

const limiter = new Bottleneck({
  minTime: 100, // Minimum time between requests (ms)
  maxConcurrent: 10
});

const translation = {
  緯度: 'latitude',
  経度: 'longitude',
  測定局コード: 'id',
  測定局名称: 'bureauName',
  所在地: 'location',
  測定局種別: 'measuringStationType',
  問い合わせ先: 'contactInformation',
  都道府県コード: 'prefectureCode',
};

export const name = 'japan';

export async function fetchData (source, cb) {
/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
  try {
    const data = await getAirQualityData(source.url);
    cb(null, {
      name: 'unused',
      measurements: data,
    });
  } catch (error) {
    log.error(error);
    cb(error);
  }
}

async function fetchStations (stationsCsvUrl) {
  try {
    const response = await got(stationsCsvUrl);
    return new Promise((resolve, reject) => {
      parse(
        response.body,
        {
          columns: (header) => header.map((col) => translation[col]),
        },
        (err, records) => {
          err ? reject(err) : resolve(records);
        }
      );
    });
  } catch (error) {
    log.error(error);
  }
}

function getTokyoDateTimeMinusDay () {
  const now = DateTime.utc().setZone('Asia/Tokyo');
  return now.minus({ days: 1 });
}

const tokyoTime = getTokyoDateTimeMinusDay();
const year = tokyoTime.toFormat('yyyy');
const month = tokyoTime.toFormat('MM');
const day = tokyoTime.toFormat('dd');

const stationsCsvUrl = `https://soramame.env.go.jp/data/map/kyokuNoudo/${year}/${month}/${day}/01.csv`;

async function fetchStationData (latestDataUrl, stationId, unixTimeStamp) {
  const url = `${latestDataUrl}${stationId}/today.csv?_=${unixTimeStamp}`;
  const response = await got(url);
  return new Promise((resolve, reject) => {
    parse(response.body, { columns: true }, (err, records) => {
      err ? reject(err) : resolve(records);
    });
  });
}

async function getAirQualityData (jpDataUrl) {
  const stationData = await fetchStations(stationsCsvUrl);

  const now = DateTime.now().setZone('utc');
  const unixTimeStamp = now.toMillis();

  const bottleneckedStationRequests = stationData
    // slice -HERE- to debug
    .map(async (station) => {
      const stationId = station.id;
      try {
        const data = await limiter.schedule(() =>
          fetchStationData(jpDataUrl, stationId, unixTimeStamp)
        );

        const result = data.flatMap((row) => {
          return Object.entries(units)
            .filter(
              ([parameter]) =>
                row.hasOwnProperty(parameter) && row[parameter] !== ''
            )
            .map(([parameter]) => {
              const standardizedParam =
                parameter === 'PM2.5'
                  ? 'pm25'
                  : parameter.toLowerCase();

              if (acceptableParameters.includes(standardizedParam)) {
                const value = parseFloat(row[parameter]);
                if (!isNaN(value)) {
                  return {
                    location: station.location,
                    city: ' ',
                    coordinates: {
                      latitude: parseFloat(station.latitude),
                      longitude: parseFloat(station.longitude)
                    },
                    date: {
                      utc: now
                        .startOf('hour')
                        .toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
                      local: now
                        .setZone('Asia/Tokyo')
                        .startOf('hour')
                        .toFormat("yyyy-MM-dd'T'HH:mm:ssZZ")
                    },
                    parameter: standardizedParam,
                    value: value,
                    unit: units[parameter],
                    attribution: [
                      {
                        name: 'Ministry of the Environment Air Pollutant Wide Area Monitoring System',
                        url: 'https://soramame.env.go.jp/'
                      }
                    ],
                    averagingPeriod: { unit: 'hours', value: 1 }
                  };
                }
              }
              return null;
            })
            .filter((item) => item !== null);
        });

        const uniqueResults = Array.from(
          new Set(result.map((obj) => JSON.stringify(obj)))
        ).map((json) => JSON.parse(json));

        return uniqueResults;
      } catch (error) {
        log.error(
          `Failed to fetch data for stationId: ${stationId}`,
          error
        );
        return [];
      }
    });

  const results = await Promise.all(bottleneckedStationRequests);

  return results.flat();
}

const units = {
  SO2: 'ppm',
  NO: 'ppm',
  NO2: 'ppm',
  NOX: 'ppm',
  CO: 'ppm',
  OX: 'ppm',
  NMHC: 'ppmC',
  CH4: 'ppmC',
  THC: 'ppmC',
  SPM: 'mg/m3',
  'PM2.5': 'µg/m3',
  SP: 'mg/m3',
  WD: '',
  WS: '',
  TEMP: '',
  HUM: ''
};
