/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the ACUMAR Argentina data source.
 */

'use strict';

import got from 'got';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import log from '../lib/logger.js';

let offset;

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

export const name = 'acumar';

export async function fetchData (source, cb) {
  source.datetime ? offset = 4 : offset = 1; // determines which row will be read
  try {
    const results = await Promise.all(
      stations.map((station) => getPollutionData(station))
    );

    const flattenedResults = results.flat();

    cb(null, {
      name: 'unused',
      measurements: flattenedResults,
    });
  } catch (error) {
    log.error(`Error fetching data: ${error.message}`);
    cb(error);
  }
}

async function getPollutionData(station) {
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
    const response = await got(station.url, {
      timeout: {
        request: 5000,
        connect: 1000,
        secureConnect: 1000,
        socket: 5000,
        response: 5000,
        send: 1000
      },
    });
    const $ = load(response.body);

    const firstDataRow = $('table')
      .eq(station.table)
      .find('tr')
      .eq(offset); // source.datetime will determine which row to read

    const dateStr = firstDataRow.find('td').eq(0).text().trim();
    const timeStr = firstDataRow
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
        firstDataRow
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
  } catch (error) {
    log.error(`Error fetching data: ${error.message}`);
  }

  results = results.filter((m) => m.value !== 0 && !isNaN(m.value));
  return results;
}