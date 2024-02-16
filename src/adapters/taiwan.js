/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Taiwan data sources.
 */

import log from '../lib/logger.js';
import got from 'got';
import { DateTime } from 'luxon';

export const name = 'taiwan';

export async function fetchData(source, cb) {
  try {
    const stationData = await getStationData(source);
    if (!stationData) throw new Error('Failed to fetch station data.');

    const urls = createUrls(stationData, 3);

    const responses = await Promise.all(urls.map(async ({ SiteID, url }) => {
      const data = await fetchUrl(url);
      return { SiteID, data };
    }));

    const combinedData = responses.filter(({ data }) => data !== null)
                                  .map(({ SiteID, data }) => ({
                                    ...combineResponseObjects(data),
                                    SiteID
                                  }));

    const formattedData = formatData(combinedData, stationData);
    cb(null, {
      name: 'unused',
      measurements: formattedData,
    });
  } catch (error) {
    cb(error, null);
  }
}

async function fetchUrl(url) {
  try {
    const response = await got(url, {
      headers: { 'Accept': 'application/json' },
    }).json();
    return response;
  } catch (error) {
    log.debug(
      `Error fetching or parsing data from: ${url}`,
      error.response?.body || error.message
    );
    return null;
  }
}

// enter the amount of hours to overfetch by
function createDateStringsForLastHours(hours) {
  const dateStrings = [];
  for (let hour = 1; hour <= hours; hour++) {
    const dateTime = DateTime.now()
      .setZone('Asia/Taipei')
      .minus({ hours: hour });
    dateStrings.push(dateTime.toFormat('yyyyMMddHH'));
  }
  return dateStrings;
}

async function getStationData(source) {

  const stationDataUrl = source.stationURL + DateTime.now().toISODate();
  const data = await fetchUrl(stationDataUrl);
  if (data) {
    return data;
  } else {
    log.debug('Failed to fetch station data.');
    return null;
  }
}

function createUrls(stationData, hours) {
  const dateStrings = createDateStringsForLastHours(hours);
  const urlsWithSiteID = [];

  stationData.forEach(station => {
    const { SiteID } = station;
    dateStrings.forEach(dateString => {
      const url = `https://airtw.moenv.gov.tw/json/airlist/airlist_${SiteID}_${dateString}.json`;
      urlsWithSiteID.push({ SiteID, url });
    });
  });

  return urlsWithSiteID;
}


function combineResponseObjects(responseArray) {
  return responseArray.reduce((accumulator, currentObject) => {
    const key = Object.keys(currentObject)[0];
    accumulator[key] = currentObject[key];
    return accumulator;
  }, {});
}
function formatData(data, stationData) {
  const validParameters = {
    PM25_FIX: 'pm25',
    PM10_FIX: 'pm10',
    O3_FIX: 'o3',
    NO2_FIX: 'no2',
    SO2_FIX: 'so2',
    CO_FIX: 'co',
  };

  let formattedData = data.flatMap(entry => {
    const station = stationData.find(station => station.SiteID === entry.SiteID);
    const coordinatesValid = station && station.TWD97_Lat !== undefined && station.TWD97_Lon !== undefined;

    return Object.entries(validParameters).flatMap(([paramKey, paramName]) => {
      if (entry.hasOwnProperty(paramKey) && entry[paramKey] !== undefined) {
        const unit = paramName === 'pm25' || paramName === 'pm10' ? 'µg/m³' :
                     paramName === 'o3' || paramName === 'so2' || paramName === 'no2' ? 'ppb' :
                     paramName === 'co' ? 'ppm' : 'unknown';

        if (!coordinatesValid || unit === 'unknown' || isNaN(parseFloat(entry[paramKey]))) {
          log.debug(`Invalid data filtered out: `, {
            parameter: paramName,
            unit,
            value: entry[paramKey],
            coordinates: coordinatesValid ? { latitude: station.TWD97_Lat, longitude: station.TWD97_Lon } : undefined,
          });
          return [];
        }

        return [{
          location: `${entry.county} - ${entry.sitename}`,
          city: entry.county,
          parameter: paramName,
          unit: unit,
          averagingPeriod: { value: 1, unit: 'hours' },
          attribution: [
            { name: 'Taiwan Ministry of Environment', url: 'https://airtw.moenv.gov.tw/' },
          ],
          coordinates: {
            latitude: station.TWD97_Lat,
            longitude: station.TWD97_Lon,
          },
          value: parseFloat(entry[paramKey]),
          date: {
            utc: DateTime.fromFormat(entry.date, 'yyyy/MM/dd HH:mm', {
              zone: 'Asia/Taipei',
            }).toUTC().toISO({ suppressMilliseconds: true }),
            local: DateTime.fromFormat(entry.date, 'yyyy/MM/dd HH:mm', {
              zone: 'Asia/Taipei',
            }).toISO({ suppressMilliseconds: true }),
          },
        }];
      }
      return [];
    });
  });

  return formattedData;
}

