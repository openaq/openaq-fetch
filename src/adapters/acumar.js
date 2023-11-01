'use strict';

import client from '../lib/requests.js';
import log from '../lib/logger.js';
import { load } from 'cheerio';
import { DateTime } from 'luxon';

const stations = [
  {
    station: 'EMC I Dock Sud',
    table: 0,
    coordinates: { latitude: -34.667375, longitude: -58.329231 },
    url: 'http://jmb.acumar.gov.ar/calidad/contaminantes.php',
  },
  {
    station: 'EMC II La Matanza',
    table: 0,
    coordinates: { latitude: -34.883175, longitude: -58.682542 },
    url: 'http://jmb.acumar.gov.ar/calidad/contaminantesEmcII.php',
  },
];

let offset;

export const name = 'acumar';

export async function fetchData (source, cb) {
  try {
    if (source.datetime) {
      log.debug(`Fetching data with ${source.datetime}`);
      const dateLuxon = source.datetime.toFormat('dd/MM/yy');
      const hourLuxon = source.datetime.toFormat('HH');

      const results = await Promise.all(
        stations.map((station) =>
          getPollutionData(station, dateLuxon, hourLuxon, 1)
        )
      );

      const flattenedResults = results.flat();

      cb(null, {
        name: 'unused',
        measurements: flattenedResults,
      });
    } else {
      offset = 1;

      const results = await Promise.all(
        stations.map((station) =>
          getPollutionData(station, null, null, 3)
        )
      );

      const flattenedResults = results.flat();
      cb(null, {
        name: 'unused',
        measurements: flattenedResults,
      });
    }
  } catch (error) {
    log.error(`Error fetching data: ${error.message}`);
    cb(error);
  }
}

async function getPollutionData(
  station,
  dateLuxon,
  hourLuxon,
  numRows
) {
  const pollutantParams = [
    'no2',
    'no',
    'nox',
    'o3',
    'pm10',
    'pm25',
    'so2',
    'co',
  ];
  let results = [];

  try {
    const response = await client(station.url);
    const $ = load(response.body);

    if (dateLuxon && hourLuxon) {
      const firstDataRowIndex = $('table')
        .eq(station.table)
        .find('tr')
        .get()
        .findIndex((row) => {
          const dateCell = $(row).find('td').eq(0).text().trim();
          const hourCell = $(row)
            .find('td')
            .eq(1)
            .text()
            .trim()
            .replace(' hs.', '');
          return dateCell === dateLuxon && hourCell === hourLuxon;
        });

      const timeRows = $('table')
        .eq(station.table)
        .find('tr')
        .slice(firstDataRowIndex, firstDataRowIndex + numRows);

      timeRows.each((_, row) => {
        processRow($, row, station, pollutantParams, results);
      });
    } else {
      const recentRows = $('table')
        .eq(station.table)
        .find('tr')
        .slice(offset, offset + numRows);

      recentRows.each((_, row) => {
        processRow($, row, station, pollutantParams, results);
      });
    }
  } catch (error) {
    log.error(`Error fetching data: ${error.message}`);
  }

  results = results.filter((m) => m.value !== 0 && !isNaN(m.value));
  return results;
}

function processRow ($, row, station, pollutantParams, results) {
  const dateStr = $(row).find('td').eq(0).text().trim();
  const timeStr = $(row)
    .find('td')
    .eq(1)
    .text()
    .trim()
    .replace(' hs.', '');
  const localDate = DateTime.fromFormat(
    `${dateStr} ${timeStr}`,
    'dd/MM/yy H',
    { zone: 'America/Argentina/Buenos_Aires' }
  );
  const utcDate = localDate.toUTC();

  pollutantParams.forEach((param, index) => {
    const value = parseFloat(
      $(row)
        .find('td')
        .eq(index + 2)
        .text()
        .trim()
    );

    results.push({
      city: 'Buenos Aires',
      location: station.station,
      parameter: param,
      value,
      unit: param === 'co' ? 'mg/m³' : 'µg/m³',
      date: {
        local: localDate.toISO({ suppressMilliseconds: true }),
        utc: utcDate.toISO({ suppressMilliseconds: true }),
      },
      coordinates: station.coordinates,
      attribution: [
        {
          name: 'ACUMAR',
          url: station.url,
        },
      ],
      averagingPeriod: {
        unit: 'hours',
        value: 1,
      },
    });
  });
}
