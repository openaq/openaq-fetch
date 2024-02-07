/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Taiwan data sources.
 */

'use strict';

import got from 'got';
import { DateTime } from 'luxon';
import log from '../lib/logger.js';

export const name = 'taiwan';

const locationIds = [...Array.from(new Array(150), (x, i) => i + 1)];

export async function fetchData (source, cb) {
  const dateTimeOneHourAgo = DateTime.now()
    .setZone('Asia/Taipei')
    .minus({ hours: 1 });
  const dateString = dateTimeOneHourAgo.toFormat('yyyyMMddHH');
  const baseUrl = source.url.replace('{dateStr}', dateString);
  const stationDataUrl =
    source.stationURL + DateTime.now().toISODate();

  try {
    const formattedMeasurements = await allData(
      baseUrl,
      locationIds,
      stationDataUrl
    );
    const data = {
      name: 'unused',
      measurements: formattedMeasurements,
    };
    log.debug(formattedMeasurements);
    cb(null, data);
  } catch (error) {
    log.error(error);
    cb(error);
  }
}
function createUrls (baseUrl, locationIds, dateStr) {
  return locationIds.map(id =>
    baseUrl
      .replace('{i}', id.toString())
      .replace('{dateStr}', dateStr)
  );
}

async function fetchUrl (url) {
  try {
    return await got(url, {
      headers: { Accept: 'application/json' },
    }).json();
  } catch (error) {
    log.debug(
      `Error fetching or parsing data from: ${url}`,
      error.response?.body
    );
    return null;
  }
}

function combineData (airQualityData, stationData) {
  return Object.entries(airQualityData).reduce(
    (combined, [key, airQualityEntry]) => {
      const stationEntry = stationData.find(
        (station) => station.SiteName === airQualityEntry.sitename
      );
      if (
        stationEntry &&
        stationEntry.TWD97_Lon &&
        stationEntry.TWD97_Lat &&
        airQualityEntry.date
      ) {
        combined[key] = { ...airQualityEntry, ...stationEntry };
      }
      return combined;
    },
    {}
  );
}

function formatData (combinedData) {
  const parameters = {
    PM25_FIX: 'pm25',
    PM10_FIX: 'pm10',
    O3_FIX: 'o3',
    NO2_FIX: 'no2',
    SO2_FIX: 'so2',
  };

  return Object.values(combinedData).flatMap((entry) =>
    Object.entries(parameters)
      .filter(([paramKey]) => entry[paramKey] !== undefined)
      .filter(([paramKey]) => !Number.isNaN(parseFloat(entry[paramKey])))
      .map(([paramKey, paramName]) => ({
        location: `${entry.county} - ${entry.sitename}`,
        city: ' ',
        parameter: paramName,
        unit: 'µg/m³',
        averagingPeriod: { value: 1, unit: 'hours' },
        attribution: [
          { name: 'Taiwan Ministry of Environment', url: 'https://airtw.moenv.gov.tw/' },
        ],
        coordinates: {
          latitude: entry.TWD97_Lat,
          longitude: entry.TWD97_Lon,
        },
        value: parseFloat(entry[paramKey]),
        date: {
          utc: DateTime.fromFormat(entry.date, 'yyyy/MM/dd HH:mm', {
            zone: 'Asia/Taipei',
          })
            .toUTC()
            .toISO({ suppressMilliseconds: true }),
          local: DateTime.fromFormat(entry.date, 'yyyy/MM/dd HH:mm', {
            zone: 'Asia/Taipei',
          }).toISO({ suppressMilliseconds: true }),
        },
      }))
  );
}

async function allData (baseUrl, locationIds, stationDataUrl) {
  const dateTimeOneHourAgo = DateTime.now()
    .setZone('Asia/Taipei')
    .minus({ hours: 1 });
  const dateString = dateTimeOneHourAgo.toFormat('yyyyMMddHH');

  const urls = createUrls(baseUrl, locationIds, dateString);
  const airQualityData = (
    await Promise.all(urls.map(fetchUrl))
  ).reduce((acc, data, index) => {
    if (data) {
      const locationId = locationIds[index];
      acc[locationId] = data.reduce(
        (acc, obj) => ({ ...acc, ...obj }),
        {}
      );
    }
    return acc;
  }, {});

  try {
    const stationData = await fetchUrl(stationDataUrl);
    const combinedData = combineData(airQualityData, stationData);
    return formatData(combinedData);
  } catch (error) {
    log.debug(
      `Error fetching station data from ${stationDataUrl}:`,
      error
    );
    return [];
  }
}
