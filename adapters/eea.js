'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import proj4 from 'proj4';
import epsg from 'proj4js-defs';
import { convertUnits, acceptableParameters } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

// Load all the EPSG definitions
epsg(proj4);

export const name = 'eea';

exports.fetchData = function (source, cb) {
  // Because we're getting the data async, make a top-level timeout
  // to keep things from going on forever. Default to 7 minutes
  const timeoutId = setTimeout(() => {
    return cb({message: 'Failure to receive data from EEA system.'});
  }, (process.env.EEA_GLOBAL_TIMEOUT || 360) * 1000);

  // Unsure of how date is exactly handled by the EEA system, the adapter
  // applies a generous buffer to the toDate and fromDate
  let fromDate = moment.utc().subtract(12, 'hour').format('YYYY-MM-DD+HH[%3A]mm');
  let toDate = moment.utc().add(1, 'hour').format('YYYY-MM-DD+HH[%3A]mm');

  // Only ask for the pollutants we want
  let pollutants = acceptableParameters.map((p) => {
    // https://github.com/openaq/openaq-fetch/issues/202
    if (p === 'pm25') { p = 'PM2.5'; }
    return p.toUpperCase();
  });
  pollutants = pollutants.join();
  let finalUrl = `http://fme.discomap.eea.europa.eu/fmedatastreaming/AirQuality/AirQualityUTDExport.fmw?FromDate=${fromDate}&ToDate=${toDate}&Countrycode=${source.country}&Pollutant=${pollutants}&Format=XML&UserToken=${process.env.EEA_TOKEN}&RunAsync=True`;

  request(finalUrl, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to receive job ID from EEA.'});
    }

    // Since we're asking for the data asynchronously, keep checking for
    // results every few seconds.
    const $ = cheerio.load(body, {xmlMode: true});
    let checkerId;
    checkerId = setInterval(() => {
      request($('ResultURL').text(), (err, res, body) => {
        if (err) {
          return cb({message: 'Failure to load EEA job result.'});
        }

        // Check to see if data is ready yet
        const $ = cheerio.load(body, {xmlMode: true});
        if ($('Code').text() !== 'BlobNotFound') {
          // Cancel the timers
          clearInterval(checkerId);
          clearTimeout(timeoutId);

          // Wrap everything in a try/catch in case something goes wrong
          try {
            // Format the data
            var data = formatData(body);
          } catch (e) {
            return cb({message: 'Unknown adapter error.'});
          }

          // Make sure data is valid
          if (data === undefined) {
            return cb({message: 'Failure to parse data.'});
          }

          cb(null, data);
        }
      });
    }, (process.env.EEA_ASYNC_RECHECK || 60) * 1000);
  });
};

// Loop over measurements, adding station data and saving to database.
const formatData = (body) => {
  let $ = cheerio.load(body, {xmlMode: true});

  // Reproject if necessary
  // EPSG:4979 is the correct projection, but not found in EPSG definition file
  const parseCoordinates = function (x, y, from) {
    if (from === 'EPSG:4979') {
      return [x, y];
    } else {
      return proj4(proj4.defs(from), proj4.defs('EPSG:4326'), [x, y]);
    }
  };

  // Return date object given local date and timezone url
  const getDate = function (date, timezone) {
    // For offset, we're making use of the fact that moment.js picks up first string
    // like +02 in the provided url
    const mo = moment.utc(date, 'YYYY-MM-DD HH:mm:ss').utcOffset(timezone, true);

    return {utc: mo.toDate(), local: mo.format('YYYY-MM-DDTHH:mm:ssZ')};
  };

  let measurements = [];

  // Loop over each <record> in the XML and store the measurement
  $('record', 'records').each(function (i, elem) {
    // If it's not a parameter we want, can skip the rest
    const parameter = $('pollutant', this).text().replace('.', '').toLowerCase();
    if (acceptableParameters.indexOf(parameter) === -1) {
      return;
    }

    let coordinates = parseCoordinates($('samplingpoint_point', this).attr('x'), $('samplingpoint_point', this).attr('y'), $('samplingpoint_point', this).attr('coordsys'));
    let m = {
      date: getDate($('value_datetime_end', this).text(), $('network_timezone', this).text()),
      parameter: parameter,
      location: $('station_name', this).text(),
      value: Number($('value_numeric', this).text()),
      unit: $('value_numeric', this).attr('unit'),
      city: $('network_name', this).text().replace(/"/g, ''),
      averagingPeriod: {unit: 'hours', value: 1},
      coordinates: {
        latitude: Number(coordinates[1]),
        longitude: Number(coordinates[0])
      },
      attribution: [{
        name: 'European Environmental Agency',
        url: 'http://www.eea.europa.eu/themes/air/air-quality'
      }]
    };
    measurements.push(m);
  });

  // Make sure units are correct
  measurements = convertUnits(measurements);

  // Ship it off to be saved!
  return {name: 'unused', measurements: measurements};
};
