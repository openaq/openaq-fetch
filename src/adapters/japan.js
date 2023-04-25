import { DateTime } from 'luxon';
import got from 'got';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { parse } from 'csv-parse';
import { performance } from 'perf_hooks';

const acceptableParameters = [
  'pm25',
  'pm10',
  'co',
  'so2',
  'no2',
  'bc',
  'o3',
  'no',
  'pm1',
  'nox',
];

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
  HUM: '',
};

async function readCSV(filePath) {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  let csvContent = '';

  for await (const line of rl) {
    csvContent += line + '\n';
  }

  return new Promise((resolve, reject) => {
    parse(csvContent, { columns: true }, (err, records) => {
      err ? reject(err) : resolve(records);
    });
  });
}

async function fetchStationData(stationId, unixTimeStamp) {
  const url = `https://soramame.env.go.jp/data/sokutei/NoudoTime/${stationId}/today.csv?_=${unixTimeStamp}`;
  const response = await got(url);
  return new Promise((resolve, reject) => {
    parse(response.body, { columns: true }, (err, records) => {
      err ? reject(err) : resolve(records);
    });
  });
}

async function getAirQualityData() {
  const metadata = await readCSV('csvs/metadata.csv');
  const stationCoords = await readCSV('csvs/stationCoords.csv');
  const now = DateTime.now().setZone('utc');
  const unixTimeStamp = now.toMillis();

  const stationsDataPromises = metadata
    // .slice(0, 400)
    .map(async (station) => {
      const stationId = station['測定局コード'];
      try {
        const data = await fetchStationData(stationId, unixTimeStamp);
        const coord = stationCoords.find(
          (s) => s['測定局コード'] === stationId
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
                    station: station['測定局名称'],
                    location: station['住所'],
                    city: station['市区町村名'],
                    coordinates: {
                      lat: parseFloat(coord['緯度']),
                      lon: parseFloat(coord['経度']),
                    },
                    date: {
                      utc: now.toISO({ suppressMilliseconds: true }),
                      local: now
                        .setZone('Asia/Tokyo')
                        .toISO({ suppressMilliseconds: true }),
                    },
                    parameter: standardizedParam,
                    value: value,
                    unit: units[parameter],
                  };
                }
              }
              return null;
            })
            .filter((item) => item !== null);
        });

        return result;
      } catch (error) {
        console.error(
          `Failed to fetch data for stationId: ${stationId}`,
          error
        );
        return [];
      }
    });

  const results = await Promise.all(stationsDataPromises);

  // Flatten the array of arrays
  return results.flat();
}

async function main() {
  const start = performance.now();
  try {
    const data = await getAirQualityData();
    console.log(data);
  } catch (error) {
    console.error(error);
  } finally {
    const end = performance.now();
    console.log(`Total execution time: ${end - start} milliseconds`);
  }
}

main();
