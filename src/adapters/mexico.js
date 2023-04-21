/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Mexican data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */

'use strict';

import {
  unifyMeasurementUnits,
  unifyParameters,
  removeUnwantedParameters,
} from '../lib/utils.js';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import got from 'got';
import { DateTime } from 'luxon';
import async from 'async';
import { load } from 'cheerio';
import sslRootCas from 'ssl-root-cas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Adding in certs to get around unverified connection issue
const rootCas = sslRootCas.create();

const certificatePath = join(
  __dirname,
  '..',
  '/certs/sinaica.inecc.gob.mx.chained.crt'
);

rootCas.inject().addFile(certificatePath);

const gotInstance = got.extend({
  timeout: { request: REQUEST_TIMEOUT },
  https: {
    certificateAuthority: rootCas,
  },
});

export const name = 'mexico';

export async function fetchData(source, cb) {
/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
  const tasks = fetchAllStationSites(
    await gotInstance(source.sourceURL).text(),
    source.url
  ).map((e) => {
    return async function () {
      const response = await gotInstance(e);
      return response.body;
    };
  });
  async.parallel(tasks, function (err, results) {
    if (err) {
      return cb({ message: 'Failure to load data urls.' });
    }
    const data = formatData(results);
    if (data === undefined) {
      return cb({ message: 'Failure to parse data.' });
    }
    cb(null, data);
  });
}

/**
 * Goes through main page of site, and finds the urls for all the stations pages, and returns them
 * @param {*} page Mainpage of the source
 * @param {string} url String of baseurl for sites
 * @return {array} Array of urls
 */

const fetchAllStationSites = function (page, url) {
  const $ = load(page);
  return $('#selPickHeadEst option')
    .map(function () {
      return url + $(this).val();
    })
    .get();
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} pages Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */

const formatData = function (pages) {
  /**
   * Fetches the city from a htmlstring and adds it to template
   * @param {string} place HTML string from the page, which displays location
   * @param {object} template object of the template to use in creating measurements
   */
  const getCity = (place, template) => {
    const hexCodes = {
      '&#xF3;': 'ó',
      '&#xED;': 'í',
      '&#xE9;': 'é',
      '&#xE1;': 'á',
      '&#xC1;': 'Á',
      '&#xCD;': 'Í',
      '&#xF1;': 'ñ',
      '&#xD3;': 'Ó',
      '&#xC9;': 'É',
      '&#xFA;': 'ú',
    };
    Object.keys(hexCodes).forEach((h) => {
      while (place.search(h) !== -1) {
        place = place.replace(h, hexCodes[h]);
      }
    });
    const hexPos = place.search('&');
    if (hexPos !== -1) {
      console.log(place.substring(hexPos, hexPos + 6));
    }
    place = place.split('<br>');
    const locationMarkers = ['Municipio:', 'Colonia:', 'Estado:'];
    for (let i of locationMarkers) {
      let found = false;
      for (let j in place) {
        if (place[j].search(i) !== -1) {
          template.city = place[j].replace(i, '').trim();
          found = true;
        }
      }
      if (found) break;
    }
  };

  let measurements = [];
  // Loops through each oage
  pages.forEach((page) => {
    const $ = load(page);
    // base template
    const template = {
      attribution: [
        {
          name: 'SINAICA',
          url: 'https://sinaica.inecc.gob.mx/index.php',
        },
      ],
      averagingPeriod: { unit: 'hours', value: 1 },
    };
    // checks if page has any values to read
    if (
      $($('#tabs-1').get(0)).text().trim() !==
      'No hay datos disponibles de las últimas 24 horas.'
    ) {
      // finds the city
      $('.tbl-est.table tr').each((i, e) => {
        if ($('th', e).text() === 'Dirección postal:') {
          getCity($('td', e).html().trim(), template);
        }
      });
      // Tries to find location, and values in the document script of the page, and then adds them to measurements
      try {
        // base documentscript
        const values = $('script')
          .toArray()
          .map((script) => $(script).html())
          .filter((script) => script.search('conts = {') !== -1)[0];

        // Metadata from the documentscript, turns it into json to get latitude, longitude and location
        let meta = values.substring(values.indexOf('est = {'));
        meta = meta.substring(
          String('est = {').length - 1,
          meta.indexOf('};') + 1
        );
        meta = JSON.parse(meta);
        template.coordinates = {
          latitude: parseFloat(meta.lat),
          longitude: parseFloat(meta.long),
        };
        template.location = meta.nombre;
        const timezone = getTimeZone(meta.zonaHoraria);

        // formats the data and values from the documentscript into readable data
        let data = values.substring(values.indexOf('conts = {'));
        data = data.substring(
          String('conts = {').length - 1,
          data.indexOf('};') + 1
        );
        data = JSON.parse(data);
        // Loops through all parameters of the site
        Object.values(data).forEach((param) => {
          // Loops through all the measurements for each parameter
          param.forEach((d) => {
            if (d != null) {
              const dateLuxon = DateTime.fromFormat(
                d.fecha + ' ' + d.hora,
                'yyyy-MM-dd H',
                { zone: timezone }
              );
              let m = Object.assign(
                {
                  unit:
                    d.parametro === 'PM10' || d.parametro === 'PM2.5'
                      ? 'µg/m3'
                      : 'ppm',
                  value: parseFloat(d.valorAct),
                  parameter: d.parametro,
                  date: {
                    utc: dateLuxon
                      .toUTC()
                      .toISO({ suppressMilliseconds: true }),
                    local: dateLuxon.toISO({
                      suppressMilliseconds: true,
                    }),
                  },
                },
                template
              );
              m = unifyMeasurementUnits(m);
              m = unifyParameters(m);
              measurements.push(m);
            }
          });
        });
      } catch (e) {}
    }
  });
  measurements = removeUnwantedParameters(measurements);
  return {
    name: 'unused',
    measurements: measurements,
  };
};

function getTimeZone(timezone) {
  switch (timezone) {
    case 5: // Tiempo del noroeste, UTC-8 (UTC-7 en verano)
      return 'America/Tijuana';
    case 4: // Sonora, UTC-7
      return 'America/Hermosillo';
    case 3: // Tiempo del pac&#xED;fico, UTC-7 (UTC-6 en verano)
      return 'America/Chihuahua';
    case 8: // Tiempo del centro (UTC-6 todo el a&#xF1;o)
      return 'America/Mexico_City';
    case 1: // Tiempo del centro, UTC-6 (UTC-5 en verano)
      return 'America/Mexico_City';
    default:
      throw new Error('UNKNOWN TIMEZONE: ' + timezone);
  }
}
