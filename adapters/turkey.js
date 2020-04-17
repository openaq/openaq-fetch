/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Taiwanese data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { parallel } from 'async';
import { convertUnits, acceptableParameters } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT, jar: true}); // Allowing cookies

exports.name = 'turkey';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  // Fetching both the main data page as well as a page to get all
  // coordinates for locations
  parallel({
    sources: (done) => {
      request(source.url, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done({message: 'Failure to load data url.'});
        }

        return done(null, body);
      });
    },
    coordinates: (done) => {
      // This url seems to have a list of all locations
      request('http://index.havaizleme.gov.tr/Map', (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done({message: 'Failure to load coordinates url.'});
        }

        return done(null, body);
      });
    }
  }, (err, results) => {
    if (err) {
      return cb(err);
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(results);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      return cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
const formatData = function (data) {
  // Turn this into an object containing coordinates, there is a bit of
  // hackery going on here since we're pulling out values from JSON in code
  let coordsHTML = cheerio.load(data.coordinates).html();
  const coordsRe = /var stations = jQuery.parseJSON\('(.*)'\);/g;
  const metadata = JSON.parse(coordsRe.exec(coordsHTML)[1]);

  /* -- Get individual measurements -- */
  let $ = cheerio.load(data.sources);

  // First get parameters from header
  let headers = {};
  $('thead>tr').each((i, row) => {
    $('th', row).each((j, elem) => {
      const key = (i === 0) ? 'name' : 'unit';
      if (!headers[j]) { headers[j] = {}; }
      headers[j][key] = $('small', elem).text().trim().toLowerCase();
    });
  });

  // Now get each measurement
  let records = [];
  // Each row within table, outside of header
  $('tbody>tr').each((i, row) => {
    let base = {};

    // Location, city
    $('td>a', row).each((j, elem) => {
      const arr = $(elem).text().split(' - ');
      if (arr.length === 2) {
        base.location = arr[1].trim();
        base.city = arr[0].trim();
      }
    });

    // Time
    $('td>span', row).each((j, elem) => {
      // Multiple matches, save one that has time format
      const str = $(elem).text().trim();
      if (str.search(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/) !== -1) {
        base.dateString = str;
      }
    });

    // Loop over measurements and clone from base
    $('td>table>tr>td:first-child', row).each((j, elem) => {
      const idx = j + 2; // Need to add 2 to match headers indexing
      let record = Object.assign({}, base);
      record.parameter = headers[idx]['name'];
      record.unit = headers[idx]['unit'];
      if ($('span', elem).text() !== '') {
        record.value = Number($('span', elem).text().replace(',', '.')); // Account for alternate numbering scheme
      }

      if (acceptableParameters.includes(headers[idx]['name']) && record.city && record.location && record.value !== undefined) {
        records.push(record);
      }
    });
  });

  /**
   * Given a json object, convert to aq openaq format
   * @param {json object} item coming from source data
   * @return {object} a repacked object
   */
  const aqRepack = (item) => {
    // Find the associated metadata by looking for location/county in address
    let locationMetadata;
    for (let i = 0; i < metadata.length; i++) {
      const m = metadata[i];
      if (m.Name.includes(item.location) && m.Name.includes(item.city)) {
        locationMetadata = m;
        break;
      }
    }

    // Exit if we have no metadata
    if (!locationMetadata) {
      return;
    }

    const dateMoment = moment.tz(item.dateString, 'DD-MM-YYYY HH:mm', 'Europe/Istanbul');
    const measurement = {
      date: {
        utc: dateMoment.toDate(),
        local: dateMoment.format()
      },
      location: item.location,
      city: item.city,
      value: item.value,
      parameter: item.parameter,
      unit: item.unit,
      coordinates: {
        latitude: locationMetadata.Lat,
        longitude: locationMetadata.Long
      },
      attribution: [{name: 'National Air Quality Monitoring Network', url: 'http://index.havaizleme.gov.tr/Dynamic/0'}],
      averagingPeriod: {unit: 'hours', value: 1}
    };

    if (isNaN(item.value)) {
      console.log(item);
    }

    measurements.push(measurement);
  };

  let measurements = [];
  records.forEach(aqRepack);
  measurements = convertUnits(measurements);
  return {name: 'unused', measurements: measurements};
};
