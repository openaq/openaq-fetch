import got from 'got';
import { DateTime } from 'luxon';
import fs from 'fs/promises';

const baseUrl =
  'https://airtw.moenv.gov.tw/json/airlist/airlist_{i}_{dateStr}.json';
const start = 1;
const end = 150;
const stationDataPath = './stations2.json';

function createUrls(baseUrl, start, end, dateStr) {
  return Array.from({ length: end - start + 1 }, (_, i) =>
    baseUrl
      .replace('{i}', (start + i).toString())
      .replace('{dateStr}', dateStr)
  );
}

async function fetchUrl (url) {
  try {
    return await got(url, {
      headers: { Accept: 'application/json' },
    }).json();
  } catch (error) {
    console.error(
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

function formatData(combinedData) {
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
      .map(([paramKey, paramName]) => ({
        location: `Taiwan: ${entry.county} - ${entry.sitename}`,
        parameter: paramName,
        unit: 'µg/m³',
        averagingPeriod: { value: 1, unit: 'hours' },
        attribution: [
          { name: 'Taiwan EPA', url: 'https://epa.gov.tw' },
        ],
        coordinates: {
          latitude: entry.TWD97_Lat,
          longitude: entry.TWD97_Lon,
        },
        value: parseFloat(entry[paramKey]),
        date: {
          utc: DateTime.fromFormat(entry.date, 'yyyy/MM/dd HH:mm', {
            zone: 'utc',
          }).toISO(),
          local: entry.date,
        },
      }))
  );
}

async function fetchData(baseUrl, start, end, stationDataPath) {
  const dateTimeOneHourAgo = DateTime.now()
    .setZone('Asia/Taipei')
    .minus({ hours: 1 });
  const dateString = dateTimeOneHourAgo.toFormat('yyyyMMddHH');

  const urls = createUrls(baseUrl, start, end, dateString);
  const airQualityData = (
    await Promise.all(urls.map(fetchUrl))
  ).reduce(
    (acc, data, index) =>
      data
        ? {
            ...acc,
            [index + start]: data.reduce(
              (acc, obj) => ({ ...acc, ...obj }),
              {}
            ),
          }
        : acc,
    {}
  );

  try {
    const stationData = JSON.parse(
      await fs.readFile(stationDataPath, 'utf8')
    );
    const combinedData = combineData(airQualityData, stationData);
    return formatData(combinedData);
  } catch (error) {
    console.error(
      `Error reading station data from ${stationDataPath}:`,
      error
    );
    return [];
  }
}

fetchData(baseUrl, start, end, stationDataPath).then(
  (formattedMeasurements) => {
    console.log(
      `Total measurements: ${formattedMeasurements.length}`
    );
    console.log(formattedMeasurements);
  }
);
