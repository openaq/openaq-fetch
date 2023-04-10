'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import log from '../lib/logger.js';
import { unifyMeasurementUnits } from '../lib/utils.js';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'saopaulo';

export const paramCodes = {
  pm25: 57,
  pm10: 12,
  co: 16,
  so2: 13,
  o3: 63,
  no2: 15
};

// Promisify post request
async function promisePostRequest (url, formParams, headers) {
  return new Promise((resolve, reject) => {
    request.post(url, { form: formParams, headers: headers, encoding: null }, (error, res, data) => {
      if (!error && (res.statusCode === 200)) {
        resolve(data.toString('latin1'));
      } else {
        reject(error);
      }
    });
  });
}

// Special post request to pass back cookie
async function promiseAuthRequest (url, params) {
  return new Promise((resolve, reject) => {
    request.post(url, { form: params }, (error, res, data) => {
      if (!error && res.statusCode === 302) { // redirect for authentication counts as success
        resolve(res.headers['set-cookie']);
      } else {
        reject(error);
      }
    });
  });
}

export async function fetchData (source, cb) {
  // Authenticate
  const authURL = source.url + '/autenticador';
  const authParams = {
    cetesb_login: process.env.CETESB_LOGIN,
    cetesb_password: process.env.CETESB_PASSWORD
  };
  // Get hourly data by parameter
  const dataURL = source.url + '/conDadosHorariosPorParametro.do?method=executarImprimir';
  const dateNow = moment().tz('America/Sao_Paulo');
  const dataParams = {
    dataStr: dateNow.format('DD/MM/YYYY'),
    horaStr: dateNow.format('HH:mm'),
    tipoMedia: 'MH' // hourly average
  };

  try {
    const auth = await promiseAuthRequest(authURL, authParams);
    const cookie = auth[0].split(';')[0];

    // Create promises with post requests and parsing for all parameters
    const allParams = Object.values(paramCodes).map(p =>
      promisePostRequest(dataURL, { ...dataParams, nparmtsSelecionados: p }, { cookie: cookie })
        // in case a request fails, handle gracefully
        .catch(error => { log.warn(error || 'Unable to load data for parameter'); return null; })
        .then(data => parseParams(data)));

    const allData = await Promise.all(allParams);
    const measurements = _.flatten((allData.filter(d => (d))));

    cb(null, { name: 'unused', measurements });
  } catch (e) {
    cb(e);
  }
}

function parseParams (data) {
  if (!data) return null;
  var $ = cheerio.load(data, { decodeEntities: false });

  // Get parameter and unit
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
  const paramString = $('tbody').last().children().first().text().trim();
  const parameter = niceParameter(paramString.split(' ')[1].trim());
  const unit = paramString.split(')')[1].trim();

  // Future TODO: Add checks to make sure rows and cols are lining up as we are assuming
  var timeStamps = $($('tbody').last().children()[2]).children();
  var dataRows = $('tbody').last().children().slice(3);

  const paramMeasurements = [];

  dataRows.each((_, row) => {
    row = $(row).children();

    // Build base measurement
    const location = $(row[0]).text().trim();
    if (!Object.keys(coordinates).includes(location)) {
      log.warn('Unknown or new location:', location);
    } else {
      const base = {
        parameter: parameter,
        location: location,
        attribution: [{'name': 'CETESB', 'url': 'http://cetesb.sp.gov.br/'}],
        averagingPeriod: {'value': 1, 'unit': 'hours'},
        coordinates: coordinates[location],
        city: stationsCities[location] || location || 'São Paulo'
      };

      // Get values and dates
      row.each((i, e) => {
        if (i !== 0) {
          let value = $(e).text();
          if (value !== '' && value !== ' ' && value !== '--') {
            value = value.replace(',', '.');
            // Get date from timeStamps, index -1 since there's an extra column here for the station name
            const date = moment.tz($(timeStamps[i - 1]).text(), 'DD/MM/YYYYHH:mm', 'America/Sao_Paulo');
            const m = {
              date: { utc: date.toDate(), local: date.format() },
              value: Number(value),
              unit: unit
            };
            unifyMeasurementUnits(m);
            paramMeasurements.push({ ...base, ...m });
          }
        }
      });
    }
  });
  return paramMeasurements;
}

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
  'Paulínia-Sta Terezinha': '',
  'Perus': '',
  'Pinheiros': 'São Paulo',
  'Piracicaba': '',
  'Presidente Prudente': '',
  'Ribeirão Preto': '',
  'Rio Claro-Jd.Guanabara': '',
  'S.André-Capuava': 'Santo André',
  'S.André-Paço Municipal': 'Santo André',
  'S.Bernardo-Centro': 'São Bernardo do Campo',
  'S.Bernardo-Paulicéia': 'São Bernardo do Campo',
  'S.Caetano': 'São Caetano do Sul',
  'S.José Campos': 'São José dos Campos',
  'S.José Campos-Jd.Satelite': 'São José dos Campos',
  'S.José Campos-Vista Verde': 'São José dos Campos',
  'Santa Gertrudes': '',
  'Santana': 'São Paulo',
  'Santo Amaro': 'São Paulo',
  'Santos': '',
  'Santos-Ponta da Praia': 'Santos',
  'São José do Rio Preto': '',
  'Sorocaba': '',
  'Taboão da Serra': '',
  'Tatuí': '',
  'Taubaté': ''
};

// List of coordinates from https://github.com/openaq/openaq-fetch/issues/98
export const coordinates = {
  'Guaratinguetá': { latitude: -22.80191714, longitude: -45.19112236 },
  'Jacareí': { latitude: -23.29419924, longitude: -45.96823386 },
  'S.José Campos': { latitude: -23.18788733, longitude: -45.87119762 },
  'S.José Campos-Jd.Satelite': { latitude: -23.22364548, longitude: -45.8908 },
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
  'Paulínia-Sta Terezinha': { latitude: -22.780208950215425, longitude: -47.139036494729396 },
  'Perus': { latitude: -23.413209739894405, longitude: -46.756053990921224 },
  'Rio Claro-Jd.Guanabara': { latitude: -22.43904378887939, longitude: -47.58147331085557 },
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
  'Grajaú-Parelheiros': { latitude: -23.77626598, longitude: -46.69696108 },
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
  'São José do Rio Preto': { latitude: -20.78468928, longitude: -49.39827779 },
  'Araçatuba': { latitude: -21.1868411, longitude: -50.43931685 },
  'Marília': { latitude: -22.19980949, longitude: -49.95996975 },
  'Presidente Prudente': { latitude: -22.11993673, longitude: -51.40877707 }
};
