/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Tehran data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

var request = require('request');
var cheerio = require('cheerio');
var _ = require('lodash');
var moment = require('moment-timezone');
var async = require('async');

// This source requires a cookie to get the English page
var j = request.jar();
var cookie = request.cookie('AQCCul=en-Us');

exports.name = 'tehran';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  // Fetch both the measurements and meta-data about the locations
  var sources = [source.url, 'http://31.24.238.89/home/station.aspx'];
  var tasks = [];

  _.forEach(sources, function (e) {
    var task = function (cb) {
      j.setCookie(cookie, e);
      request({url: e, jar: j}, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        cb(null, body);
      });
    };

    tasks.push(task);
  });

  async.parallel(tasks, function (err, results) {
    if (err) {
      return cb({message: 'Failure to load data urls.'});
    }

    async.waterfall([
      async.apply(parseStations, results),
      formatData
    ], function (err, result) {
      if (err) return cb({message: 'Failure to parse data.'});
      cb(null, result);
    });
  });
};

/**
 * Parse a table with meta-data about the stations
 */
function parseStations (results, callback) {
  var $ = cheerio.load(results[1]);

  var stations = [];

  $('table#ContentPlaceHolder1_grd tr').each(function (idy, row) {
    var s;

    // Check if this row isn't a table header
    if ($(this).find('th').length === 0) {
      s = {
        name: $('td', this).eq(0).text(),
        coordinates: {
          latitude: $('td', this).eq(4).text(),
          longitude: $('td', this).eq(5).text()
        }
      };
      stations.push(s);
    }
  });
  callback(null, stations, results);
}

function parseDate (dateString) {
  var regExp = new RegExp('([0-9/]*) at ([0-9]* (AM|PM))');
  var d = dateString.match(regExp);
  var date = moment.tz(d[1] + d[2], 'M/D/YYYYhA', 'Asia/Tehran');

  return {utc: date.toDate(), local: date.format()};
};

function formatData (stations, results, callback) {
  var $ = cheerio.load(results[0]);

  var location;
  var params = ['location'];
  var measurements = [];

  // Parse the date
  var date = parseDate($('#ContentPlaceHolder1_lblStationPsi').text());
  console.log(date);

  // Store the main properties for this measuring station
  var base = {
    city: 'Tehran',
    date: date,
    attribution: [{
      name: 'Air Quality Control Company - Affiliated with Tehran Municipality',
      url: 'http://air.tehran.ir/'
    }]
  };

  // Get the data
  $('#ContentPlaceHolder1_grdPSI tr').each(function (idy, row) {
    if (idy === 0) {
      $(this).children().each(function (idx, cell) {
        if ($(this).hasClass('lblEN')) {
          params.push($(this).text().replace('.', '').toLowerCase());
        }
      });
    } else {
      var firstCell = $(this).children().first().text().trim();
      // Not interested in aggregated data from first rows
      if (firstCell !== 'AQI - Average' || firstCell !== 'AQI - Maximum') {
        $(this).children().each(function (idx, cell) {
          if (idx === 0) {
            location = firstCell;
          } else {
            var m = _.clone(base);
            m.location = location;
            m.parameter = params[idx];
            m.unit = 'no idea';
            m.value = Number($(this).text());
            m.averagingPeriod = {value: '?', unit: '?'};

            var i = _.findIndex(stations, function (o) { return o.name === location; });
            if (i !== -1) {
              m.coordinates = stations[i].coordinates;
            }
            measurements.push(m);
          }
        });
      }
    };
    console.log(measurements);
  });

  var m = {name: 'unused', measurements: measurements};

  callback(null, m);
}
