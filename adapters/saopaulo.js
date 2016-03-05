'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');
var async = require('async');
var cheerio = require('cheerio');
var utils = require('../lib/utils');
var log = require('../lib/logger');

exports.name = 'saopaulo';

exports.fetchData = function (source, cb) {
  // First fetch all the stations from link below and then load them
  // http://sistemasinter.cetesb.sp.gov.br/Ar/php/ar_dados_horarios.php

  request(source.sourceURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load source url.'});
    }
    var stations = [];
    var $ = cheerio.load(body);
    $($('#selEst').children()).each(function () {
      stations.push($(this).val());
    });

    // Now create a task for each station
    var tasks = [];
    _.forEach(stations, function (s) {
      var task = function (cb) {
        var form = makePostForm(s);
        request.post(source.url, {form: form}, function (err, res, body) {
          if (err || res.statusCode !== 200) {
            return cb(err || res);
          }
          return cb(null, body);
        });
      };

      tasks.push(task);
    });

    async.parallelLimit(tasks, 4, function (err, results) {
      if (err) {
        return cb({message: 'Failure to load data urls.'});
      }

      // Wrap everything in a try/catch in case something goes wrong
      try {
        // Format the data
        var data = formatData(results);
        if (data === undefined) {
          return cb({message: 'Failure to parse data.'});
        }
        cb(null, data);
      } catch (e) {
        return cb({message: 'Unknown adapter error.'});
      }
    });
  });
};

// Build up the url post object to query
var makePostForm = function (station) {
  // Get current date in Sao Paulo
  var date = moment().tz('America/Sao_Paulo').format('DD-MM-YYYY');
  return {
    texData: date,
    selEst: station
  };
};

// Create a measurement for every value in the table and let the upstream
// insert fail. Could be optimized in the future.
var formatData = function (results) {
  var measurements = [];

  // Take out <br> and trim whitespace/returns
  var niceStrip = function (string) {
    return string.replace('<br>', '').trim();
  };

  var niceParameter = function (parameter) {
    switch (parameter) {
      case 'MP10':
        return 'pm10';
      case 'MP2.5':
        return 'pm25';
      default:
        return parameter.toLowerCase();
    }
  };

  var getDate = function (day, time) {
    // Grab date from page, add time string and convert to date
    var dateString = day + ' ' + time;
    var date = moment.tz(dateString, 'DD/MM/YYYY HH:mm', 'America/Sao_Paulo');

    return {utc: date.toDate(), local: date.format()};
  };

  // Try to find a nice unit to use for the measurement
  var niceUnit = function (string) {
    if (string.indexOf('&micro;g/m&sup3;') !== -1) {
      return 'µg/m³';
    } else if (string.indexOf('ppm') !== -1) {
      return 'ppm';
    } else {
      log.warn('Unknown unit', string);
      return undefined;
    }
  };

  // This will loop over each individual station page we've received
  _.forEach(results, function (r) {
    // Load the html into Cheerio
    var $ = cheerio.load(r, {decodeEntities: false});

    // Get the title of the page based on a style class, this feels bad
    var title = $($('.font04').first()).html();
    var match = / - \d{2}\/\d{2}\/\d{4}/.exec(title);
    var day = match[0].split(' - ')[1];
    var location = title.substring(0, match.index);

    var base = {
      location: location,
      attribution: [{'name': 'CETESB', 'url': 'http://cetesb.sp.gov.br/'}],
      averagingPeriod: {'value': 1, 'unit': 'hours'}
    };

    // Loop over each table (column), first is hours, others are params
    var hours = [];
    $($('table').get(6)).find('table').each(function (i) {
      // Hours
      if (i === 0) {
        $(this).children().each(function (j) {
          if (j >= 2) { // Skip firs two rows
            // Add hours to the array
            hours.push($($(this).find('td')).html());
          }
        });
      } else {
        // Other parameters, get title and see if we want to keep them
        var parameter = niceStrip($($(this).find('strong')).html());
        if (['MP10', 'MP2.5', 'O3', 'SO2', 'NO2', 'CO'].indexOf(parameter) !== -1) {
          var unit = niceUnit($($($(this).find('strong')).parent()).text());
          $(this).children().each(function (j) {
            if (j >= 2) { // Skip firs two rows
              // Grab the first td (col) this works for us since we want the hourly
              var value = niceStrip($($(this).find('td')).html());
              // Make sure we have a valid value
              if (value !== '' && value !== ' ' && value !== '--') {
                var m = _.cloneDeep(base);
                if (_.indexOf(_.keys(stationsCities), location) !== -1) {
                  m.city = stationsCities[location] || location;
                }
                m.value = Number(value);
                m.parameter = niceParameter(parameter);
                m.unit = unit;
                m.date = getDate(day, hours[j - 2]); // Subtract 2 to match hours array

                measurements.push(m);
              }
            }
          });
        }
      }
    });
  });

  // Convert units to platform standard
  measurements = utils.convertUnits(measurements);
  return {name: 'unused', measurements: measurements};
};

// stations and their respective cities mapping
// if city === "" then city = station
var stationsCities = {
  'Americana': '',
  'Araçatuba': '',
  'Araraquara': '',
  'Bauru': '',
  'Campinas-Centro': 'Campinas',
  'Campinas-Taquaral': 'Campinas',
  'Campinas-V.União': 'Campinas',
  'Capão Redondo': 'São Paulo',
  'Carapicuiba': '',
  'Catanduva': '',
  'Cerqueira César': '',
  'Cid.Universitária-USP-Ipen': 'São Paulo',
  'Congonhas': 'São Paulo',
  'Cubatão-Centro': 'Cubatão',
  'Cubatão-V.Parisi': 'Cubatão',
  'Cubatão-Vale do Mogi': 'Cubatão',
  'Diadema': '',
  'Guarulhos-Paço Municipal': 'Guarulhos',
  'Guarulhos-Pimentas': 'Guarulhos',
  'Ibirapuera': 'São Paulo',
  'Interlagos': 'São Paulo',
  'Itaim Paulista': 'São Paulo',
  'Itaquera': 'São Paulo',
  'Jacareí': '',
  'Jaú': '',
  'Jundiaí': '',
  'Limeira': '',
  'Marg.Tietê-Pte Remédios': 'São Paulo',
  'Marília': '',
  'Mauá': '',
  'Mooca': 'São Paulo',
  'N.Senhora do Ó': 'São Paulo',
  'Osasco': '',
  'Parelheiros': 'São Paulo',
  'Parque D.Pedro II': 'São Paulo',
  'Paulínia': '',
  'Paulínia Sul': '',
  'Pinheiros': 'São Paulo',
  'Piracicaba': '',
  'Presidente Prudente': '',
  'Ribeirão Preto': '',
  'S.André-Capuava': 'Santo André',
  'S.André-Paço Municipal': 'Santo André',
  'S.Bernardo-Centro': 'São Bernardo do Campo',
  'S.Bernardo-Paulicéia': 'São Bernardo do Campo',
  'S.Caetano': 'São Caetano do Sul',
  'S.José Campos': 'São José dos Campos',
  'S.José Campos-Jd.Satélite': 'São José dos Campos',
  'S.José Campos-Vista Verde': 'São José dos Campos',
  'Santa Gertrudes': '',
  'Santana': 'São Paulo',
  'Santo Amaro': 'São Paulo',
  'Santos': '',
  'Santos-Ponta da Praia': 'Santos',
  'São José Do Rio Preto': '',
  'Sorocaba': '',
  'Taboão da Serra': '',
  'Tatuí': '',
  'Taubaté': ''
};

exports.stationsCities = stationsCities;
