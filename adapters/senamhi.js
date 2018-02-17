'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'senamhi';

export function fetchData (source, cb) {
  request(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb(err || res);
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
}

const formatData = function (results) {
  let measurements = [];
  const $ = cheerio.load(results);

  // We're looking for the script tag with the locations in it
  let scriptText;
  $('script').each((i, elem) => {
    if ($(elem).text().indexOf('var locations =') !== -1) {
      scriptText = $(elem).text();
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
    const html = cheerio.load(l[4]);

    // Make sure we've got some valid html in here and not an error message
    if (!html('td', html('tr').eq(0)).eq(1).html()) {
      return;
    }

    // Location name
    const location = html('td', html('tr').eq(0)).eq(1).html().trim();

    // Convert DMS to decimal degrees for fun
    const coordsRe = /.*: (\d*)&#xB0;(\d*)&#x2032;(\d*\.?\d*)&#x2033; .*: (\d*)&#xB0;(\d*)&#x2032;(\d*\.?\d*)&#x2033;/.exec(html('td', html('tr').eq(2)).eq(1).html().trim());
    const coordinates = {
      latitude: -1.0 * (Number(coordsRe[1]) + Number(coordsRe[2]) / 60.0 + Number(coordsRe[3]) / 3600.0).toFixed(6),
      longitude: -1.0 * (Number(coordsRe[4]) + Number(coordsRe[5]) / 60.0 + Number(coordsRe[6]) / 3600.0).toFixed(6)
    };

    // Create our base object
    const base = {
      location: location,
      coordinates: coordinates,
      city: 'Lima',
      attribution: [{'name': 'Peru Ministerio de Ambiente', 'url': 'http://www.senamhi.gob.pe/'}],
      averagingPeriod: {'value': 1, 'unit': 'hours'},
      unit: 'µg/m³'
    };

    // Filter out for <td> that match the format we want for the concentrations
    let ms = html('tr').filter((i, elem) => {
      return /^\d{2}\/\d{2}\/\d{4}$/.test(html('td', elem).first().text().trim());
    });

    // Loop over first 4 time rows to minimize number of inserts to database upstream
    ms.each((i, m) => {
      if (i >= 4) {
        return;
      }

      // Build the datetime
      const dt = moment.tz(`${html('td', m).eq(0).text().trim()} ${html('td', m).eq(1).text().trim()}`, 'DD/MM/YYYY HH:mm', 'America/Lima');

      // pm25
      let pm25 = Object.assign({
        value: Number(html('td', m).eq(2).text().trim()),
        parameter: 'pm25',
        date: {
          utc: dt.toDate(),
          local: dt.format()
        }
      }, base);
      measurements.push(pm25);

      // pm10
      let pm10 = Object.assign({
        value: Number(html('td', m).eq(3).text().trim()),
        parameter: 'pm10',
        date: {
          utc: dt.toDate(),
          local: dt.format()
        }
      }, base);
      measurements.push(pm10);

      // so2
      let so2 = Object.assign({
        value: Number(html('td', m).eq(4).text().trim()),
        parameter: 'so2',
        date: {
          utc: dt.toDate(),
          local: dt.format()
        }
      }, base);
      measurements.push(so2);

      // no2
      let no2 = Object.assign({
        value: Number(html('td', m).eq(5).text().trim()),
        parameter: 'no2',
        date: {
          utc: dt.toDate(),
          local: dt.format()
        }
      }, base);
      measurements.push(no2);

      // o3
      let o3 = Object.assign({
        value: Number(html('td', m).eq(6).text().trim()),
        parameter: 'o3',
        date: {
          utc: dt.toDate(),
          local: dt.format()
        }
      }, base);
      measurements.push(o3);

      // co
      let co = Object.assign({
        value: Number(html('td', m).eq(7).text().trim().replace(',', '')),
        parameter: 'co',
        date: {
          utc: dt.toDate(),
          local: dt.format()
        }
      }, base);
      measurements.push(co);
    });
  });

  // Be kind, convert units
  measurements = convertUnits(measurements);

  return {name: 'unused', measurements: measurements};
};
