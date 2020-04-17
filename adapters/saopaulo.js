'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import log from '../lib/logger';
import { parallelLimit } from 'async';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

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

    parallelLimit(tasks, 4, function (err, results) {
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
      averagingPeriod: {'value': 1, 'unit': 'hours'},
      coordinates: coordinates[location]
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
  measurements = convertUnits(measurements);
  return {name: 'unused', measurements: measurements};
};

// stations and their respective cities mapping
// if city === "" then city = station
export const stationsCities = {
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

// List of coordinates from https://github.com/openaq/openaq-fetch/issues/98
export const coordinates = {
  'Guaratinguetá': { latitude: -22.80191714, longitude: -45.19112236 },
  'Jacareí': { latitude: -23.29419924, longitude: -45.96823386 },
  'S.José dos Campos': { latitude: -23.18788733, longitude: -45.87119762 },
  'S.José dos Campos-Jd.Satélite': { latitude: -23.22364548, longitude: -45.8908 },
  'S.José dos Campos-Vista Verde': { latitude: -23.18369735, longitude: -45.83089698 },
  'Taubaté': { latitude: -23.03235096, longitude: -45.57580502 },
  'Ribeirão Preto': { latitude: -21.15394189, longitude: -47.82848053 },
  'Ribeirão Preto-Centro': { latitude: -21.17706594, longitude: -47.81898767 },
  Americana: { latitude: -22.7242527, longitude: -47.33954929 },
  'Campinas-Centro': { latitude: -22.9025248, longitude: -47.05721074 },
  'Campinas-Taquaral': { latitude: -22.87461894, longitude: -47.05897276 },
  'Campinas-V.União': { latitude: -22.94672842, longitude: -47.11928086 },
  'Jundiaí': { latitude: -23.19200374, longitude: -46.89709727 },
  Limeira: { latitude: -22.56360378, longitude: -47.41431403 },
  'Paulínia': { latitude: -22.77232138, longitude: -47.15484287 },
  'Paulínia-Sul': { latitude: -22.78680643, longitude: -47.13655888 },
  Piracicaba: { latitude: -22.70122234, longitude: -47.64965269 },
  'Santa Gertrudes': { latitude: -22.45995527, longitude: -47.53629834 },
  Cambuci: { latitude: -23.56770841, longitude: -46.61227286 },
  'Capão Redondo': { latitude: -23.66835615, longitude: -46.78004338 },
  'Carapicuíba': { latitude: -23.53139503, longitude: -46.83577973 },
  Centro: { latitude: -23.54780616, longitude: -46.6424145 },
  'Cerqueira César': { latitude: -23.55354256, longitude: -46.67270477 },
  'Cid.Universitária-USP-Ipen': { latitude: -23.56634178, longitude: -46.73741428 },
  Congonhas: { latitude: -23.61632008, longitude: -46.66346553 },
  Diadema: { latitude: -23.68587641, longitude: -46.61162193 },
  'Grajau-Parelheiros': { latitude: -23.77626598, longitude: -46.69696108 },
  Guarulhos: { latitude: -23.46320938, longitude: -46.4962136 },
  'Guarulhos-Paço Municipal': { latitude: -23.45553426, longitude: -46.5185334 },
  'Guarulhos-Pimentas': { latitude: -23.44011701, longitude: -46.40994877 },
  Ibirapuera: { latitude: -23.59184199, longitude: -46.6606875 },
  Interlagos: { latitude: -23.68050765, longitude: -46.67504316 },
  'Itaim Paulista': { latitude: -23.50154736, longitude: -46.42073684 },
  Itaquera: { latitude: -23.58001483, longitude: -46.46665141 },
  Lapa: { latitude: -23.5093971, longitude: -46.70158164 },
  'Marg.Tietê-Pte Remédios': { latitude: -23.51870583, longitude: -46.74332004 },
  'Mauá': { latitude: -23.668549, longitude: -46.46600027 },
  'Mogi das Cruzes': { latitude: -23.51817223, longitude: -46.18686057 },
  Mooca: { latitude: -23.54973405, longitude: -46.60041665 },
  'N.Senhora do Ó': { latitude: -23.48009871, longitude: -46.69205192 },
  Osasco: { latitude: -23.52672142, longitude: -46.79207766 },
  'Parque D.Pedro II': { latitude: -23.54484566, longitude: -46.62767559 },
  'Pico do Jaraguá': { latitude: -23.4562689, longitude: -46.76609776 },
  Pinheiros: { latitude: -23.56145989, longitude: -46.70201651 },
  'S.André-Capuava': { latitude: -23.6398037, longitude: -46.49163677 },
  'S.André-Centro': { latitude: -23.64561638, longitude: -46.53633467 },
  'S.André-Paço Municipal': { latitude: -23.6569942, longitude: -46.53091876 },
  'S.Bernardo-Centro': { latitude: -23.69867109, longitude: -46.54623219 },
  'S.Bernardo-Paulicéia': { latitude: -23.67135396, longitude: -46.58466789 },
  'S.Miguel Paulista': { latitude: -23.49852641, longitude: -46.44480278 },
  Santana: { latitude: -23.50599272, longitude: -46.6289603 },
  'Santo Amaro': { latitude: -23.65497723, longitude: -46.70999838 },
  'São Caetano do Sul': { latitude: -23.61844277, longitude: -46.55635394 },
  'Taboão da Serra': { latitude: -23.60932386, longitude: -46.75829437 },
  'Cubatão-Centro': { latitude: -23.87902673, longitude: -46.41848336 },
  'Cubatão-V.Parisi': { latitude: -23.84941617, longitude: -46.38867624 },
  'Cubatão-Vale do Mogi': { latitude: -23.83158901, longitude: -46.36956879 },
  Santos: { latitude: -23.9630572, longitude: -46.32117009 },
  'Santos-Ponta da Praia': { latitude: -23.98129516, longitude: -46.30050959 },
  Pirassununga: { latitude: -22.00771288, longitude: -47.42756449 },
  Sorocaba: { latitude: -23.50242658, longitude: -47.47902991 },
  'Tatuí': { latitude: -23.36075154, longitude: -47.87079907 },
  Araraquara: { latitude: -21.78252215, longitude: -48.18583181 },
  Bauru: { latitude: -22.3266084, longitude: -49.09275931 },
  'Jaú': { latitude: -22.29861966, longitude: -48.5674574 },
  Catanduva: { latitude: -21.14194276, longitude: -48.98307527 },
  'São José Do Rio Preto': { latitude: -20.78468928, longitude: -49.39827779 },
  'Araçatuba': { latitude: -21.1868411, longitude: -50.43931685 },
  'Marília': { latitude: -22.19980949, longitude: -49.95996975 },
  'Presidente Prudente': { latitude: -22.11993673, longitude: -51.40877707 }
};
