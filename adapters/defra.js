'use strict';

var request = require('request');
var moment = require('moment-timezone');
var log = require('../lib/logger');
import cheerio from 'cheerio';

exports.name = 'defra';

exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      log.error(err || res);
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(source, body);

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

var formatData = function (source, data) {
  let measurements = [];
  // Load the html into Cheerio
  var $ = cheerio.load(data);
  $('.current_levels_table').each((i, e) => {
    $('tr', $(e)).each((i, e) => {
      handleLocation(e);
    });
  });

  function sanitizeName (name) {
    return name.trim();
  }

  function sanitizeDate (date) {
    let m = moment.tz(date, 'DD/MM/YYYYHH:mm', 'Europe/London');
    return {utc: m.toDate(), local: m.format()};
  }

  function getValue (measuredValue) {
    if (measuredValue === 'n/a' || measuredValue === 'n/m') {
      return NaN;
    }

    let idx = measuredValue.indexOf('(');
    return Number(measuredValue.substring(0, idx));
  }

  function handleMeasurement (parameter, el, period, base) {
    let m = Object.assign({}, base);
    m.value = getValue($(el).text());
    m.parameter = parameter;
    m.averagingPeriod = period;
    m.unit = 'µg/m³';
    if (isNaN(m.value)) {
      return;
    }

    return m;
  }

  function handleLocation (row) {
    // Create base
    let base = {
      location: sanitizeName($($('a', $('td', $(row)).get(0)).get(0)).text()),
      date: sanitizeDate($($('td', $(row)).get(6)).text()),
      attribution: [{
        name: 'Department for Environmental Food & Rural Affairs',
        url: source.url
      }]
    };

    // Do nothing if we have a nav item
    if (base.location.indexOf('navigation') !== -1) {
      return;
    }

    // Add metadata if available
    base = Object.assign(base, metadata[base.location]);

    // O3
    let o3 = handleMeasurement(
      'o3',
      $($('td', $(row)).get(1)),
      {'value': 8, 'unit': 'hours'},
      base
    );
    if (o3) {
      measurements.push(o3);
    }

    // NO2
    let no2 = handleMeasurement(
      'no2',
      $($('td', $(row)).get(2)),
      {'value': 1, 'unit': 'hours'},
      base
    );
    if (no2) {
      measurements.push(no2);
    }

    // SO2
    let so2 = handleMeasurement(
      'so2',
      $($('td', $(row)).get(3)),
      {'value': 0.25, 'unit': 'hours'},
      base
    );
    if (so2) {
      measurements.push(so2);
    }

    // pm25
    let pm25 = handleMeasurement(
      'pm25',
      $($('td', $(row)).get(4)),
      {'value': 24, 'unit': 'hours'},
      base
    );
    if (pm25) {
      measurements.push(pm25);
    }
    // pm10
    let pm10 = handleMeasurement(
      'pm10',
      $($('td', $(row)).get(5)),
      {'value': 24, 'unit': 'hours'},
      base
    );
    if (pm10) {
      measurements.push(pm10);
    }
  }

  return {
    name: 'unused',
    measurements: measurements
  };
};

let metadata = {
  'Auchencorth Moss': {city: 'Auchencorth', coordinates: {latitude: 55.792160, longitude: -3.242900}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Dumbarton Roadside': {city: 'Dumbarton', coordinates: {latitude: 55.943197, longitude: -4.559730}},
  'Edinburgh St Leonards': {city: 'Edinburgh', coordinates: {latitude: 55.945589, longitude: -3.182186}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  'Bush Estate': {city: 'Bush Estate', coordinates: {latitude: 55.862281, longitude: -3.205782}},
  
  
  
};
