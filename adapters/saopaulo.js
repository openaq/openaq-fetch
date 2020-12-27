'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
// import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import log from '../lib/logger';
import { cookie } from 'request-promise-native';
// import { parallelLimit } from 'async';
// import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'saopaulo';

//TODO:
//PROMISIFY REQUESTS?
//EXTRACT TO ENVIRONMENT VARS

//CREATE QUERY FOR ALL VARIABLES
// path: /qualar/conDadosHorariosPorParametro.do?method=gerarRelatorio
// dataStr: 24/11/2020
// horaStr: 01:00
// tipoMedia: MH
// nparmtsSelecionados: 16
// nparmtsSelecionados: 12
// nparmtsSelecionados: 57
// nparmtsSelecionados: 15
// nparmtsSelecionados: 63
// nparmtsSelecionados: 13

//Query all stations, all pollutants
// path: /qualar/conDadosHorarios.do?method=gerarRelatorio
// dataStr: 24/11/2020
// horaStr: 02:00
// ntipoParmt: 1
// chkAll: on
// nestcasMontoSelecionadas: 290
// nestcasMontoSelecionadas: 105
// nestcasMontoSelecionadas: 107
// nestcasMontoSelecionadas: 106
// nestcasMontoSelecionadas: 108
// nestcasMontoSelecionadas: 90
// nestcasMontoSelecionadas: 89
// nestcasMontoSelecionadas: 276
// nestcasMontoSelecionadas: 275
// nestcasMontoSelecionadas: 269
// nestcasMontoSelecionadas: 263
// nestcasMontoSelecionadas: 248
// nestcasMontoSelecionadas: 94
// nestcasMontoSelecionadas: 91
// nestcasMontoSelecionadas: 95
// nestcasMontoSelecionadas: 73
// nestcasMontoSelecionadas: 87
// nestcasMontoSelecionadas: 66
// nestcasMontoSelecionadas: 119
// nestcasMontoSelecionadas: 92
// nestcasMontoSelecionadas: 98
// nestcasMontoSelecionadas: 289
// nestcasMontoSelecionadas: 118
// nestcasMontoSelecionadas: 264
// nestcasMontoSelecionadas: 279
// nestcasMontoSelecionadas: 83
// nestcasMontoSelecionadas: 262
// nestcasMontoSelecionadas: 266
// nestcasMontoSelecionadas: 97
// nestcasMontoSelecionadas: 259
// nestcasMontoSelecionadas: 110
// nestcasMontoSelecionadas: 109
// nestcasMontoSelecionadas: 84
// nestcasMontoSelecionadas: 281
// nestcasMontoSelecionadas: 270
// nestcasMontoSelecionadas: 111
// nestcasMontoSelecionadas: 65
// nestcasMontoSelecionadas: 287
// nestcasMontoSelecionadas: 85
// nestcasMontoSelecionadas: 96
// nestcasMontoSelecionadas: 120
// nestcasMontoSelecionadas: 72
// nestcasMontoSelecionadas: 117
// nestcasMontoSelecionadas: 291
// nestcasMontoSelecionadas: 112
// nestcasMontoSelecionadas: 293
// nestcasMontoSelecionadas: 284
// nestcasMontoSelecionadas: 99
// nestcasMontoSelecionadas: 113
// nestcasMontoSelecionadas: 268
// nestcasMontoSelecionadas: 114
// nestcasMontoSelecionadas: 288
// nestcasMontoSelecionadas: 115
// nestcasMontoSelecionadas: 292
// nestcasMontoSelecionadas: 100
// nestcasMontoSelecionadas: 101
// nestcasMontoSelecionadas: 254
// nestcasMontoSelecionadas: 272
// nestcasMontoSelecionadas: 102
// nestcasMontoSelecionadas: 88
// nestcasMontoSelecionadas: 277
// nestcasMontoSelecionadas: 278
// nestcasMontoSelecionadas: 236
// nestcasMontoSelecionadas: 273
// nestcasMontoSelecionadas: 63
// nestcasMontoSelecionadas: 64
// nestcasMontoSelecionadas: 258
// nestcasMontoSelecionadas: 260
// nestcasMontoSelecionadas: 86
// nestcasMontoSelecionadas: 116
// nestcasMontoSelecionadas: 67
// nestcasMontoSelecionadas: 103
// nestcasMontoSelecionadas: 256
// nestcasMontoSelecionadas: 280

//PARSE HTML TO GET DATA
//FORMAT DATA

//Promisify post request
async function promisePostRequest(url, formParams, headers) {
  return new Promise((resolve, reject) => {
    request.post(url, { form: formParams, headers: headers }, (error, res, data) => {
      // log.info(res)
      if (!error && (res.statusCode === 200 || res.statusCode === 302)) { //redirect for authentication counts as success
        resolve(data);
      } else {
        reject(error);
      }
    });
  });
}

async function promiseAuthRequest(url, params) {
  return new Promise((resolve, reject) => {
    request.post(url, { form: params }, (error, res, data) => {
      // log.info(res)
      if (!error && res.statusCode === 302) { //redirect for authentication counts as success
        resolve(res.headers['set-cookie']);
      } else {
        reject(error);
      }
    });
  });
}

// Take out <br> and trim whitespace/returns
var niceStrip = function (string) {
  return string.replace('<br>', '').trim();
};

export async function fetchData(source, cb) {
  //Authenticate
  const authURL = source.url + '/autenticador'
  const authParams = { //NEED TO SWITCH TO ENVIRONMENT VARIABLES
    cetesb_login: 'dev@openaq.org',
    cetesb_password: 'ScCrIfhHEe'
  }
  // const dataURL = source.url + '/conDadosHorariosPorParametro.do?method=gerarRelatorio'
  const dataURL = source.url + '/conDadosHorariosPorParametro.do?method=executarImprimir'
  // const dataURL = source.url + '/exportaDados.do?method=pesquisar'

  //TODO: 
  // Get current date in Sao Paulo
  // var date = moment().tz('America/Sao_Paulo').format('DD-MM-YYYY');
  // Get current date in Sao Paulo
  //   var date = moment().tz('America/Sao_Paulo').format('DD-MM-YYYY');
  //   return {
  //     texData: date,
  //     selEst: station
  const dataParams = {
    dataStr: '27/12/2020',
    horaStr: '11:00',
    tipoMedia: 'MH',
    nparmtsSelecionados: 57, //PM25
  }

  // const aq_params = {
  //   dataInicialStr: '27/12/2020',
  //   dataFinalStr: '27/12/2020',
  //   iTipoDado: 'P',
  //   irede: 'A',
  //   // estacaoVO.nestcaMonto: 290 , //aqs_code?? station
  //   // parametroVO.nparmt: 63 } // pol_code?? Parameter code for O3
  // }
  // aq_params['estacaoVO.nestcaMonto'] = 290
  // aq_params['parametroVO.nparmt'] = 63




  //ALSO ADD THESE PARAMS
  //   nparmtsSelecionados: 16, CO
  // nparmtsSelecionados: 12, PM10
  //   nparmtsSelecionados: 15,
  // nparmtsSelecionados: 63, o3
  // nparmtsSelecionados: 13,
  try {
    const auth = await promiseAuthRequest(authURL, authParams)
    const cookie = auth[0].split(';')[0]
    log.info("Successfully logged in!" + cookie);
    const data = await promisePostRequest(dataURL, dataParams, { cookie: cookie })
    log.info("Success!");
    // log.info(data);
    var $ = cheerio.load(data)

    //Get parameter and unit
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

      // Try to find a nice unit to use for the measurement
    var niceUnit = function (string) {
    //TODO: FIX THIS!!
    if (string.indexOf('&micro;g/m&sup3;') !== -1) {
      return 'µg/m³';
    } else if (string.indexOf('ppm') !== -1) {
      return 'ppm';
    } else {
      log.warn('Unknown unit', string);
      return undefined;
    }
  };
    const paramString = $('tbody').last().children().first().text().trim()
    const parameter = niceParameter(paramString.split(' ')[1].trim())
    const unit = niceUnit(paramString.split(')')[1].trim())

    var timeStamps = $($('tbody').last().children()[2]).children() //Add check to make sure we think what it is
    var firstDataRow = $($('tbody').last().children()[3]).children() //Add check to make sure we think what it is
    const timeone = $(timeStamps[0]).text()
    // const times = timeStamps.map((i, e) => {
    //   $(e).text()
    // }).get()
    // timeStamps = $(timeStamps).map(time => {
    //   $(time).children()
    // })
    // log.info(timeStamps)
    log.info("ADAATATA")
    // log.info(firstDataRow)
    // log.info(times)

    const measurements = []
    //Build base measurement
    const location = $(firstDataRow[0]).text()
    var base = {
      parameter: parameter,
      unit: unit,
      location: location, //TODO: Cleanup station name
      attribution: [{'name': 'CETESB', 'url': 'http://cetesb.sp.gov.br/'}],
      averagingPeriod: {'value': 1, 'unit': 'hours'},
      // coordinates: coordinates[location] //TODO: catch unknown stations
    };
    //Get values and dates
    //TODO: Filter out empty (--) values 
    //TODO: Add other rows and go through all the stations
    firstDataRow.each((i, e) => {
      if (i != 0) {
        //Get date from timeStamps, index -1 since there's an extra column here for the station name
        const date = moment.tz($(timeStamps[i - 1]).text(), 'DD/MM/YYYYHH:mm', 'America/Sao_Paulo');
        const m = {
          date: {
            //TODO: Check if dates are correct
            utc: date.toDate(), local: date.format()
          },
          value: $(e).text()
        }
        measurements.push({ ...base, ...m })
        // log.info(measurements)
      }
    })



    cb(null, { name: 'unused', measurements });
  }
  catch (e) {
    cb(e);
  }


  // request.post(authenticateURL, { form: params }, function (err, res, body) {
  //   // request('https://google.com', function (err, res, body) {

  //   if (err || res.statusCode != 302) {
  //     return cb({ message: 'Failure to load source url.' + err + res.statusCode });
  //   }
  //   else {
  //     log.info("Successfully logged in!");
  //     const aq_params = {
  //       dataInicialStr: '01/01/2020',
  //       dataFinalStr: '03/01/2020',
  //       iTipoDado: 'P',
  //       estacaoVO: { nestcaMonto: 63 }, //aqs_code?? for O3
  //       parametroVO: { nparmt: 63 } // pol_code?? Parameter code for O3
  //     }
  //     request.post('https://qualar.cetesb.sp.gov.br/qualar/exportaDados.do?method=pesquisar', { form: aq_params }, function (err, res, body) {
  //       if (err || res.statusCode !== 200) {
  //         return cb({ message: 'Failure to load source url.' + err + res.statusCode });
  //       }
  //       else {
  //         log.info("Success!");
  //         log.info(body)

  //       }

  //     })
  //   }

  // });
}


//   // First fetch all the stations from link below and then load them
//   // http://sistemasinter.cetesb.sp.gov.br/Ar/php/ar_dados_horarios.php

//   request(source.sourceURL, function (err, res, body) {
//     if (err || res.statusCode !== 200) {
//       return cb({message: 'Failure to load source url.'});
//     }
//     var stations = [];
//     var $ = cheerio.load(body);
//     $($('#selEst').children()).each(function () {
//       stations.push($(this).val());
//     });

//     // Now create a task for each station
//     var tasks = [];
//     _.forEach(stations, function (s) {
//       var task = function (cb) {
//         var form = makePostForm(s);
//         request.post(source.url, {form: form}, function (err, res, body) {
//           if (err || res.statusCode !== 200) {
//             return cb(err || res);
//           }
//           return cb(null, body);
//         });
//       };

//       tasks.push(task);
//     });

//     parallelLimit(tasks, 4, function (err, results) {
//       if (err) {
//         return cb({message: 'Failure to load data urls.'});
//       }

//       // Wrap everything in a try/catch in case something goes wrong
//       try {
//         // Format the data
//         var data = formatData(results);
//         if (data === undefined) {
//           return cb({message: 'Failure to parse data.'});
//         }
//         cb(null, data);
//       } catch (e) {
//         return cb({message: 'Unknown adapter error.'});
//       }
//     });
//   });
// };

// // Build up the url post object to query
// var makePostForm = function (station) {
//   // Get current date in Sao Paulo
//   var date = moment().tz('America/Sao_Paulo').format('DD-MM-YYYY');
//   return {
//     texData: date,
//     selEst: station
//   };
// };

// // Create a measurement for every value in the table and let the upstream
// // insert fail. Could be optimized in the future.
// var formatData = function (results) {
//   var measurements = [];

//   // Take out <br> and trim whitespace/returns
//   var niceStrip = function (string) {
//     return string.replace('<br>', '').trim();
//   };

//   var niceParameter = function (parameter) {
//     switch (parameter) {
//       case 'MP10':
//         return 'pm10';
//       case 'MP2.5':
//         return 'pm25';
//       default:
//         return parameter.toLowerCase();
//     }
//   };

//   var getDate = function (day, time) {
//     // Grab date from page, add time string and convert to date
//     var dateString = day + ' ' + time;
//     var date = moment.tz(dateString, 'DD/MM/YYYY HH:mm', 'America/Sao_Paulo');

//     return {utc: date.toDate(), local: date.format()};
//   };

//   // Try to find a nice unit to use for the measurement
//   var niceUnit = function (string) {
//     if (string.indexOf('&micro;g/m&sup3;') !== -1) {
//       return 'µg/m³';
//     } else if (string.indexOf('ppm') !== -1) {
//       return 'ppm';
//     } else {
//       log.warn('Unknown unit', string);
//       return undefined;
//     }
//   };

//   // This will loop over each individual station page we've received
//   _.forEach(results, function (r) {
//     // Load the html into Cheerio
//     var $ = cheerio.load(r, {decodeEntities: false});

//     // Get the title of the page based on a style class, this feels bad
//     var title = $($('.font04').first()).html();
//     var match = / - \d{2}\/\d{2}\/\d{4}/.exec(title);
//     var day = match[0].split(' - ')[1];
//     var location = title.substring(0, match.index);

//     var base = {
//       location: location,
//       attribution: [{'name': 'CETESB', 'url': 'http://cetesb.sp.gov.br/'}],
//       averagingPeriod: {'value': 1, 'unit': 'hours'},
//       coordinates: coordinates[location]
//     };

//     // Loop over each table (column), first is hours, others are params
//     var hours = [];
//     $($('table').get(6)).find('table').each(function (i) {
//       // Hours
//       if (i === 0) {
//         $(this).children().each(function (j) {
//           if (j >= 2) { // Skip firs two rows
//             // Add hours to the array
//             hours.push($($(this).find('td')).html());
//           }
//         });
//       } else {
//         // Other parameters, get title and see if we want to keep them
//         var parameter = niceStrip($($(this).find('strong')).html());
//         if (['MP10', 'MP2.5', 'O3', 'SO2', 'NO2', 'CO'].indexOf(parameter) !== -1) {
//           var unit = niceUnit($($($(this).find('strong')).parent()).text());
//           $(this).children().each(function (j) {
//             if (j >= 2) { // Skip firs two rows
//               // Grab the first td (col) this works for us since we want the hourly
//               var value = niceStrip($($(this).find('td')).html());
//               // Make sure we have a valid value
//               if (value !== '' && value !== ' ' && value !== '--') {
//                 var m = _.cloneDeep(base);
//                 if (_.indexOf(_.keys(stationsCities), location) !== -1) {
//                   m.city = stationsCities[location] || location;
//                 }
//                 m.value = Number(value);
//                 m.parameter = niceParameter(parameter);
//                 m.unit = unit;
//                 m.date = getDate(day, hours[j - 2]); // Subtract 2 to match hours array

//                 measurements.push(m);
//               }
//             }
//           });
//         }
//       }
//     });
//   });

//   // Convert units to platform standard
//   measurements = convertUnits(measurements);
//   return {name: 'unused', measurements: measurements};
//};

// // stations and their respective cities mapping
// // if city === "" then city = station
// export const stationsCities = {
//   'Americana': '',
//   'Araçatuba': '',
//   'Araraquara': '',
//   'Bauru': '',
//   'Campinas-Centro': 'Campinas',
//   'Campinas-Taquaral': 'Campinas',
//   'Campinas-V.União': 'Campinas',
//   'Capão Redondo': 'São Paulo',
//   'Carapicuiba': '',
//   'Catanduva': '',
//   'Cerqueira César': '',
//   'Cid.Universitária-USP-Ipen': 'São Paulo',
//   'Congonhas': 'São Paulo',
//   'Cubatão-Centro': 'Cubatão',
//   'Cubatão-V.Parisi': 'Cubatão',
//   'Cubatão-Vale do Mogi': 'Cubatão',
//   'Diadema': '',
//   'Guarulhos-Paço Municipal': 'Guarulhos',
//   'Guarulhos-Pimentas': 'Guarulhos',
//   'Ibirapuera': 'São Paulo',
//   'Interlagos': 'São Paulo',
//   'Itaim Paulista': 'São Paulo',
//   'Itaquera': 'São Paulo',
//   'Jacareí': '',
//   'Jaú': '',
//   'Jundiaí': '',
//   'Limeira': '',
//   'Marg.Tietê-Pte Remédios': 'São Paulo',
//   'Marília': '',
//   'Mauá': '',
//   'Mooca': 'São Paulo',
//   'N.Senhora do Ó': 'São Paulo',
//   'Osasco': '',
//   'Parelheiros': 'São Paulo',
//   'Parque D.Pedro II': 'São Paulo',
//   'Paulínia': '',
//   'Paulínia Sul': '',
//   'Pinheiros': 'São Paulo',
//   'Piracicaba': '',
//   'Presidente Prudente': '',
//   'Ribeirão Preto': '',
//   'S.André-Capuava': 'Santo André',
//   'S.André-Paço Municipal': 'Santo André',
//   'S.Bernardo-Centro': 'São Bernardo do Campo',
//   'S.Bernardo-Paulicéia': 'São Bernardo do Campo',
//   'S.Caetano': 'São Caetano do Sul',
//   'S.José Campos': 'São José dos Campos',
//   'S.José Campos-Jd.Satélite': 'São José dos Campos',
//   'S.José Campos-Vista Verde': 'São José dos Campos',
//   'Santa Gertrudes': '',
//   'Santana': 'São Paulo',
//   'Santo Amaro': 'São Paulo',
//   'Santos': '',
//   'Santos-Ponta da Praia': 'Santos',
//   'São José Do Rio Preto': '',
//   'Sorocaba': '',
//   'Taboão da Serra': '',
//   'Tatuí': '',
//   'Taubaté': ''
// };

// // List of coordinates from https://github.com/openaq/openaq-fetch/issues/98
// export const coordinates = {
//   'Guaratinguetá': { latitude: -22.80191714, longitude: -45.19112236 },
//   'Jacareí': { latitude: -23.29419924, longitude: -45.96823386 },
//   'S.José dos Campos': { latitude: -23.18788733, longitude: -45.87119762 },
//   'S.José dos Campos-Jd.Satélite': { latitude: -23.22364548, longitude: -45.8908 },
//   'S.José dos Campos-Vista Verde': { latitude: -23.18369735, longitude: -45.83089698 },
//   'Taubaté': { latitude: -23.03235096, longitude: -45.57580502 },
//   'Ribeirão Preto': { latitude: -21.15394189, longitude: -47.82848053 },
//   'Ribeirão Preto-Centro': { latitude: -21.17706594, longitude: -47.81898767 },
//   Americana: { latitude: -22.7242527, longitude: -47.33954929 },
//   'Campinas-Centro': { latitude: -22.9025248, longitude: -47.05721074 },
//   'Campinas-Taquaral': { latitude: -22.87461894, longitude: -47.05897276 },
//   'Campinas-V.União': { latitude: -22.94672842, longitude: -47.11928086 },
//   'Jundiaí': { latitude: -23.19200374, longitude: -46.89709727 },
//   Limeira: { latitude: -22.56360378, longitude: -47.41431403 },
//   'Paulínia': { latitude: -22.77232138, longitude: -47.15484287 },
//   'Paulínia-Sul': { latitude: -22.78680643, longitude: -47.13655888 },
//   Piracicaba: { latitude: -22.70122234, longitude: -47.64965269 },
//   'Santa Gertrudes': { latitude: -22.45995527, longitude: -47.53629834 },
//   Cambuci: { latitude: -23.56770841, longitude: -46.61227286 },
//   'Capão Redondo': { latitude: -23.66835615, longitude: -46.78004338 },
//   'Carapicuíba': { latitude: -23.53139503, longitude: -46.83577973 },
//   Centro: { latitude: -23.54780616, longitude: -46.6424145 },
//   'Cerqueira César': { latitude: -23.55354256, longitude: -46.67270477 },
//   'Cid.Universitária-USP-Ipen': { latitude: -23.56634178, longitude: -46.73741428 },
//   Congonhas: { latitude: -23.61632008, longitude: -46.66346553 },
//   Diadema: { latitude: -23.68587641, longitude: -46.61162193 },
//   'Grajau-Parelheiros': { latitude: -23.77626598, longitude: -46.69696108 },
//   Guarulhos: { latitude: -23.46320938, longitude: -46.4962136 },
//   'Guarulhos-Paço Municipal': { latitude: -23.45553426, longitude: -46.5185334 },
//   'Guarulhos-Pimentas': { latitude: -23.44011701, longitude: -46.40994877 },
//   Ibirapuera: { latitude: -23.59184199, longitude: -46.6606875 },
//   Interlagos: { latitude: -23.68050765, longitude: -46.67504316 },
//   'Itaim Paulista': { latitude: -23.50154736, longitude: -46.42073684 },
//   Itaquera: { latitude: -23.58001483, longitude: -46.46665141 },
//   Lapa: { latitude: -23.5093971, longitude: -46.70158164 },
//   'Marg.Tietê-Pte Remédios': { latitude: -23.51870583, longitude: -46.74332004 },
//   'Mauá': { latitude: -23.668549, longitude: -46.46600027 },
//   'Mogi das Cruzes': { latitude: -23.51817223, longitude: -46.18686057 },
//   Mooca: { latitude: -23.54973405, longitude: -46.60041665 },
//   'N.Senhora do Ó': { latitude: -23.48009871, longitude: -46.69205192 },
//   Osasco: { latitude: -23.52672142, longitude: -46.79207766 },
//   'Parque D.Pedro II': { latitude: -23.54484566, longitude: -46.62767559 },
//   'Pico do Jaraguá': { latitude: -23.4562689, longitude: -46.76609776 },
//   Pinheiros: { latitude: -23.56145989, longitude: -46.70201651 },
//   'S.André-Capuava': { latitude: -23.6398037, longitude: -46.49163677 },
//   'S.André-Centro': { latitude: -23.64561638, longitude: -46.53633467 },
//   'S.André-Paço Municipal': { latitude: -23.6569942, longitude: -46.53091876 },
//   'S.Bernardo-Centro': { latitude: -23.69867109, longitude: -46.54623219 },
//   'S.Bernardo-Paulicéia': { latitude: -23.67135396, longitude: -46.58466789 },
//   'S.Miguel Paulista': { latitude: -23.49852641, longitude: -46.44480278 },
//   Santana: { latitude: -23.50599272, longitude: -46.6289603 },
//   'Santo Amaro': { latitude: -23.65497723, longitude: -46.70999838 },
//   'São Caetano do Sul': { latitude: -23.61844277, longitude: -46.55635394 },
//   'Taboão da Serra': { latitude: -23.60932386, longitude: -46.75829437 },
//   'Cubatão-Centro': { latitude: -23.87902673, longitude: -46.41848336 },
//   'Cubatão-V.Parisi': { latitude: -23.84941617, longitude: -46.38867624 },
//   'Cubatão-Vale do Mogi': { latitude: -23.83158901, longitude: -46.36956879 },
//   Santos: { latitude: -23.9630572, longitude: -46.32117009 },
//   'Santos-Ponta da Praia': { latitude: -23.98129516, longitude: -46.30050959 },
//   Pirassununga: { latitude: -22.00771288, longitude: -47.42756449 },
//   Sorocaba: { latitude: -23.50242658, longitude: -47.47902991 },
//   'Tatuí': { latitude: -23.36075154, longitude: -47.87079907 },
//   Araraquara: { latitude: -21.78252215, longitude: -48.18583181 },
//   Bauru: { latitude: -22.3266084, longitude: -49.09275931 },
//   'Jaú': { latitude: -22.29861966, longitude: -48.5674574 },
//   Catanduva: { latitude: -21.14194276, longitude: -48.98307527 },
//   'São José Do Rio Preto': { latitude: -20.78468928, longitude: -49.39827779 },
//   'Araçatuba': { latitude: -21.1868411, longitude: -50.43931685 },
//   'Marília': { latitude: -22.19980949, longitude: -49.95996975 },
//   'Presidente Prudente': { latitude: -22.11993673, longitude: -51.40877707 }
// };
