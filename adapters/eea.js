'use strict';

import request from 'request';
import { default as _ } from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import proj4 from 'proj4';

// Load all the EPSG definitions
import epsg from 'proj4js-defs';
epsg(proj4);

import log from '../lib/logger';

export const name = 'eea';

exports.fetchData = function (source, cb) {
  // Unsure of how date is exactly handled by the EEA system, the adapter
  // applies a generous buffer to the toDate and fromDate
  let fromDate = moment.utc().subtract(3, 'hour').format('YYYY-MM-DD+HH[%3A]mm');
  let toDate = moment.utc().add(2, 'hour').format('YYYY-MM-DD+HH[%3A]mm');

  let finalUrl = `http://fme.discomap.eea.europa.eu/fmedatastreaming/AirQuality/AirQualityUTDExport.fmw?FromDate=${fromDate}&ToDate=${toDate}&Countrycode=${source.country}&Format=XML&usertoken=${process.env.EEA_TOKEN}`;

  request(finalUrl, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      log.error(err || res);
      return cb({message: 'Failure to load data url.'});
    }
    // Format the data and send it back
    const data = formatData(body);
    cb(null, data);
  });
};

// Loop over measurements, adding station data and saving to database.
const formatData = (body) => {
  let $ = cheerio.load(body, {xmlMode: true});

  // Reproject if necessary
  // EPSG:4979 is the correct projection, but not found in EPSG definition file
  var parseCoordinates = function (x, y, from) {
    if (from === 'EPSG:4979') {
      return [x, y];
    } else {
      return proj4(proj4.defs(from), proj4.defs('EPSG:4326'), [x, y]);
    }
  };

  let measurements = [];

  // Loop over each <record> in the XML and store the measurement
  $('record', 'records').each(function (i, elem) {
    let coordinates = parseCoordinates($('samplingpoint_point', this).attr('x'), $('samplingpoint_point', this).attr('y'), $('samplingpoint_point', this).attr('coordsys'));

    let m = {
      date: $('value_datetime_end', this).text(),
      parameter: $('pollutant', this).text().replace('.', '').toLowerCase(),
      // location: $('STAT_NAAM', this).text(),
      value: Number($('value_numeric', this).text()),
      unit: $('value_numeric', this).attr('unit'),
      // stationId: stationID,
      // city: getCity($('STAT_NAAM', this).text()),
      // attribution: getAttribution($('OPST_OPDR_ORGA_CODE', this).text()),
      // averagingPeriod: getPeriod(p),
      coordinates: {
        latitude: coordinates[1],
        longitude: coordinates[0]
      }
    };
    measurements.push(m);
  });

  console.log(measurements);

  // Ship it off to be saved!
  return {name: 'unused', measurements: body};
};
