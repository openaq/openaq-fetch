'use strict';

import { convertUnits } from '../lib/utils.js';

import client from '../lib/requests.js';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sslRootCas from 'ssl-root-cas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const certificatePath = join(
  __dirname,
  '..',
  '/certs/senamhi-intermediate.pem'
);

const rootCas = sslRootCas.create();

rootCas.inject().addFile(certificatePath);

export const name = 'senamhi';

export async function fetchData (source, cb) {
  try {
			const https = {
					certificateAuthority: rootCas,
      };
			const body = await client({ url: source.url, https, responseType: 'text' });

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body);
      if (data === undefined) {
        return cb({ message: 'Failure to parse data.' });
      }
      cb(null, data);
    } catch (e) {
      return cb({ message: 'Unknown adapter error.' });
    }
  } catch (error) {
    return cb(error);
  }
}
const formatData = function (results) {
  let measurements = [];
  const $ = load(results);

  // We're looking for the script tag with the locations in it
  let scriptText;
  $('script').each((i, elem) => {
    if (
      $(elem).contents().get(0) &&
      $(elem).contents().get(0).data.indexOf('var locations =') !== -1
    ) {
      scriptText = $(elem).contents().get(0).data;
    }
  });

  // Exit if no matching script
  if (scriptText === undefined) {
    return undefined;
  }

  // Some magic to break down a string that represents a JS array into an array
  const locations = eval(/var locations = (.*)/.exec(scriptText)[1]); // eslint-disable-line no-eval

  // Loop over each location and create measurements
  // TODO, loop over all
  locations.forEach((l) => {
    // The HTML element stored in the JS ¯\_(ツ)_/¯
    const html = load(l[4]);

    // Make sure we've got some valid html in here and not an error message
    if (!html('td', html('tr').eq(0)).eq(1).html()) {
      return;
    }

    // Location name
    const location = html('td', html('tr').eq(0)).eq(1).html().trim();

    // Convert DMS to decimal degrees for fun
    let coordsRe =
      /: (\d[0-9]*)°([0-9]*)′([0-9]*\.?[0-9]*)″ .*: (\d[0-9]*)°([0-9]*)′([0-9]*\.?[0-9]*)″/gim.exec(
        html('td', html('tr').eq(2)).eq(1).html().trim()
      );
    if (!coordsRe) {
      coordsRe =
        /: (\d[0-9]*)&#xB0;([0-9]*)&#x2032;([0-9]*\.?[0-9]*)&#x2033; .*: (\d[0-9]*)&#xB0;([0-9]*)&#x2032;([0-9]*\.?[0-9]*)&#x2033;/gim.exec(
          html('td', html('tr').eq(2)).eq(1).html().trim()
        );
    }
    var coordinates = null;

    if (coordsRe && coordsRe.length > 5) {
      coordinates = {
        latitude:
          -1.0 *
          (
            parseFloat(coordsRe[1]) +
            parseFloat(coordsRe[2]) / 60.0 +
            parseFloat(coordsRe[3]) / 3600.0
          ).toFixed(6),
        longitude:
          -1.0 *
          (
            parseFloat(coordsRe[4]) +
            parseFloat(coordsRe[5]) / 60.0 +
            parseFloat(coordsRe[6]) / 3600.0
          ).toFixed(6),
      };
    }

    // Create our base object
    const base = {
      location: location,
      coordinates: coordinates,
      city: 'Lima',
      attribution: [
        {
          name: 'Peru Ministerio de Ambiente',
          url: 'http://www.senamhi.gob.pe/',
        },
      ],
      averagingPeriod: { value: 1, unit: 'hours' },
      unit: 'µg/m³',
    };

    // Filter out for <td> that match the format we want for the concentrations
    const ms = html('tr').filter((i, elem) => {
      return /^\d{2}\/\d{2}\/\d{4}$/.test(
        html('td', elem).first().text().trim()
      );
    });

    // Loop over first 4 time rows to minimize number of inserts to database upstream
    ms.each((i, m) => {
      if (i >= 4) {
        return;
      }

      // Helper function to handle empty strings
      const getNumber = function (string) {
        if (string === '') {
          return NaN;
        }

        return parseFloat(string);
      };

      // Build the datetime
      const dt = DateTime.fromFormat(
        `${html('td', m).eq(0).text().trim()} ${html('td', m)
          .eq(1)
          .text()
          .trim()}`,
        'dd/MM/yyyy HH:mm',
        { zone: 'America/Lima' }
      );

      // pm25
      const pm25 = Object.assign(
        {
          value: getNumber(html('td', m).eq(2).text().trim()),
          parameter: 'pm25',
          date: {
            utc: dt.toUTC().toISO({ suppressMilliseconds: true }),
            local: dt.toISO({ suppressMilliseconds: true }),
          },
        },
        base
      );
      measurements.push(pm25);

      // pm10
      const pm10 = Object.assign(
        {
          value: getNumber(html('td', m).eq(3).text().trim()),
          parameter: 'pm10',
          date: {
            utc: dt.toUTC().toISO({ suppressMilliseconds: true }),
            local: dt.toISO({ suppressMilliseconds: true }),
          },
        },
        base
      );
      measurements.push(pm10);

      // so2
      const so2 = Object.assign(
        {
          value: getNumber(html('td', m).eq(4).text().trim()),
          parameter: 'so2',
          date: {
            utc: dt.toUTC().toISO({ suppressMilliseconds: true }),
            local: dt.toISO({ suppressMilliseconds: true }),
          },
        },
        base
      );
      measurements.push(so2);

      // no2
      const no2 = Object.assign(
        {
          value: getNumber(html('td', m).eq(5).text().trim()),
          parameter: 'no2',
          date: {
            utc: dt.toUTC().toISO({ suppressMilliseconds: true }),
            local: dt.toISO({ suppressMilliseconds: true }),
          },
        },
        base
      );
      measurements.push(no2);

      // o3
      const o3 = Object.assign(
        {
          value: getNumber(html('td', m).eq(6).text().trim()),
          parameter: 'o3',
          date: {
            utc: dt.toUTC().toISO({ suppressMilliseconds: true }),
            local: dt.toISO({ suppressMilliseconds: true }),
          },
        },
        base
      );
      measurements.push(o3);

      // co
      const co = Object.assign(
        {
          value: getNumber(
            html('td', m).eq(7).text().trim().replace(',', '')
          ),
          parameter: 'co',
          date: {
            utc: dt.toUTC().toISO({ suppressMilliseconds: true }),
            local: dt.toISO({ suppressMilliseconds: true }),
          },
        },
        base
      );
      measurements.push(co);
    });
  });

  // Be kind, convert units
  measurements = convertUnits(
    measurements.filter((i) => !isNaN(i.value))
  );

  return { name: 'unused', measurements: measurements };
};
