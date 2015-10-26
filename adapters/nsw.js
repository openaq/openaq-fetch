'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');
var cheerio = require('cheerio');
var utils = require('../lib/utils');

exports.name = 'nsw';

exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      console.error(err || res);
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body);
      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

// This is pretty nasty, but the rest of the code is as well.
var parseDate = function (dateString) {
  var d = dateString.split('<br>');

  // Split the hour string to get hours + am/pm
  var timeString = d[2].split(' ');
  // We're interested in the 'to' hour and am/pm indication
  var time = timeString[2] + timeString[3];

  // Dates are reported in a range: December 13, 11pm - 12am
  // If the 'to' time is 12am, we need to add a day, so it returns
  // December 14, 12am, instead of December 13, 12am.
  var date_offset = (time === '12am') ? 1 : 0;

  var date = moment.tz(d[1] + time, 'D MMMM YYYYha', 'Australia/Melbourne');
  date.add(date_offset, 'day');

  return {utc: date.toDate(), local: date.format()};
};

// Not every pollutant is measured in 'µg/m3'
// From: http://www.environment.nsw.gov.au/AQMS/dataindex.htm
var units = {
  'o3': 'pphm',
  'no2': 'pphm',
  'co': 'ppm',
  'neph': 'Bsp, 10-4 m-1',
  'so2': 'pphm',
  'pm25': 'µg/m³',
  'pm10': 'µg/m³'
};

var formatData = function (data) {
  var $ = cheerio.load(data);

  // Build an index with the pollutant and averaging period for each column
  var indexParams = [];
  var region = '';
  var measurements = [];
  var date = parseDate($('td.date', this).html());

  $('table.aqi tr').each(function (idy, row) {
    // Deal with the row containing the pollutant name
    if (idy === 0) {
      var colCounter = 0;

      $(this).children().each(function (idx, cell) {
        // The column counter needs to take occasional colspans into account
        var colIncrement = Number($(this).attr('colspan')) || 1;
        colCounter += colIncrement;

        if ($(this).find('a').length) {
          var regExp = new RegExp('</a><br>+(.+)');
          var param = $(this).html().match(regExp)[1].replace('.', '').toLowerCase();
          indexParams.push({col: colCounter, parameter: param, avgPeriod: null});
        }
      });

    // Deal with the row containing averaging periods
    } else if (idy === 1) {
      colCounter = 0;

      $(this).children().each(function (idx, cell) {
        // The column counter needs to take occasional colspans into account
        var colIncrement = Number($(this).attr('colspan')) || 1;
        colCounter += colIncrement;

        var regExp = new RegExp('([0-9]+)-hour');
        var period = $(this).html().match(regExp);
        if (period) {
          indexParams[_.findIndex(indexParams, { 'col': colCounter })].avgPeriod = period[1];
        }
      });

    // Any other row may contain measurements
    } else {
      colCounter = 0;

      // The existence of <td class='site'> is an indication of a measurement
      if ($(this).find('.site').length) {
        // Each region may have several sites (rows), but is only mentioned
        // once: in the row of its first site.
        var regionString = $('.region', this).text();
        region = regionString || region;

        var site = $('.site', this).text();

        // Store the main properties for this measuring station
        var base = {
          city: region,
          location: site,
          date: date,
          attribution: [{
            name: 'NSW - Office of Environment & Heritage',
            url: 'http://www.environment.nsw.gov.au/'
          }]
        };

        $(this).children().each(function (idx, cell) {
          // The column counter needs to take occasional colspans into account
          var colIncrement = Number($(this).attr('colspan')) || 1;
          colCounter += colIncrement;

          // Check if there is a value being reported and if the pollutant
          // is available in the indexParams
          var i = _.findIndex(indexParams, 'col', colCounter);
          if ($(this).text() && i !== -1) {
            var p = indexParams[i];

            var m = _.clone(base);
            m.parameter = p.parameter;
            m.unit = units[p.parameter];
            m.value = Number($(this).text());
            m.averagingPeriod = {value: Number(p.avgPeriod), unit: 'hours'};
            measurements.push(m);
          }
        });
      }
    }
  });

  // The same pollutant can contain multiple measurements per location.
  // In this case, keep the measurement with the SHORTEST averaging period.
  var finalMeasurements = [];
  for (var m in measurements) {
    // Check if this location already has a measurement for this parameter
    var match = _.findIndex(finalMeasurements, _.matches({'parameter': measurements[m].parameter, 'location': measurements[m].location}));
    if (match === -1) {
      // No matching measurement found
      finalMeasurements.push(measurements[m]);
    } else if (measurements[m].averagingPeriod.value < finalMeasurements[match].averagingPeriod.value) {
      // Matching measurement found with bigger avgPeriod
      finalMeasurements.push(measurements[m]);
      finalMeasurements.splice(match, 1);
    }
  }

  // Attempt to convert to the Open AQ standard unit
  utils.convertUnits(finalMeasurements);

  return {name: 'unused', measurements: finalMeasurements};
};
