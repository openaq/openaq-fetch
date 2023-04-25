import { DateTime } from 'luxon';
import got from 'got';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { parse } from 'csv-parse';

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
      if (err) {
        reject(err);
      } else {
        resolve(records);
      }
    });
  });
}

async function getAirQualityData() {
  const metadata = await readCSV('csvs/metadata.csv');
  const stationCoords = await readCSV('csvs/stationCoords.csv');

  const now = DateTime.now().setZone('utc');
  const unixTimeStamp = now.toMillis();

  let result = [];
  let slice = metadata.slice(0, 10);
  for (const station of slice) {
    const stationId = station['測定局コード'];
    const url = `https://soramame.env.go.jp/data/sokutei/NoudoTime/${stationId}/today.csv?_=${unixTimeStamp}`;

    try {
      const response = await got(url);
      const data = await new Promise((resolve, reject) => {
        parse(response.body, { columns: true }, (err, records) => {
          if (err) {
            reject(err);
          } else {
            resolve(records);
          }
        });
      });

      for (const row of data) {
        const coord = stationCoords.find(
          (s) => s['測定局コード'] === stationId
        );

        for (const parameter in units) {
          if (
            row.hasOwnProperty(parameter) &&
            row[parameter] !== ''
          ) {
            const standardizedParam =
              parameter === 'PM2.5'
                ? 'pm25'
                : parameter.toLowerCase();
            if (acceptableParameters.includes(standardizedParam)) {
              const json = {
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
                value: parseFloat(row[parameter]),
                unit: units[parameter],
              };
              result = result.filter((m) => !isNaN(m.value));
              result.push(json);
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `Failed to fetch data for stationId: ${stationId}`,
        error
      );
    }
  }

  result = result.filter((m) => !isNaN(m.value));
  return result;
}

getAirQualityData()
  .then((data) => console.log(data))
  .catch((error) => console.error(error));
