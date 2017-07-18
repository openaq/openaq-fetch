'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { parallel } from 'async';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'buenos aires';
export function fetchData (source, callback) {
  // take options from form to make a list of requests used to get data
  const tasks = generateTasks(source);

  parallel(tasks, (err, response) => {
    if (err) {
      return callback(new Error('Failure to load data urls.'));
    }

    // wrap in try catch to handle possible errors
    try {
      const data = formatData(response);
      if (data === undefined) {
        return callback(new Error('Failure to parse data.'));
      }
      callback(null, data);
    } catch (e) {
      return callback(new Error('Unknown adapter error.'));
    }
  });
}

// makes a requests list of requests for each station to each pollutant
const generateTasks = (source) => {
  const tasks = []
  ['LA BOCA', 'CENTENARIO', 'CORDOBA'].forEach((station, ix) => {
    const day = moment().format('DD');
    const month = moment.format('MM');
    const year = moment().format('YY');
    const stationTask = {
      name: station,
      stationNum: ix,
      coordinates: setCoordinates(ix)
    }
        const linkRequest = (callback) => {
          request.get({
            url: link
          }, (err, res, body) => {
            if (err || res.statusCode !== 200) {
              return callback(new Error('was not able to retrieve' + pollutant + ' data for ' + station));
            }
            callback(null, body);
          });
        };
        linkRequests.push(linkRequest);
      };
      makeLinks(station, pollutant);
    });
  });
  return linkRequests;
};

// the below three set*** functions set the measurement attribute per the passed pollutant or station.
const setCoordinates = (estacion) => {
  switch (estacion) {
    case 'CENTENARIO':
      return { latitude: -34.60638, longitude: -58.43194 };
    case 'CORDOBA':
      return { latitude: -34.60441667, longitude: -58.39165 };
    case 'LA BOCA':
      return { latitude: -34.62527, longitude: -58.36555 };
    default:
      break;
  }
};
const setUnits = (contaminante) => {
  switch (contaminante) {
    case 'CO':
      return 'ppm';
    case 'NO2':
      return 'ppb';
    case 'PM10':
      return 'µg/m3';
    default:
      break;
  }
};

const setPeriod = (estacion) => {
  switch (estacion) {
    case 'CO':
      return {unit: 'hours', value: 8};
    case 'NO2':
      return {unit: 'hours', value: 1};
    case 'PM10':
      return {unit: 'hours', value: 24};
    default:
      break;
  }
};

// returns list of measurements generated from requests.
const formatData = (htmlList) => {
  let measurements = htmlList.map((html) => {
    // data is in imgs' title tags like [pollutantVal - hr]
    // aqData is list of lists with said data
    let aqData = html.match(/<img[^>]+>/g).filter((img) => {
      return img.match(/hs/);
    });
    aqData = aqData.map((img) => {
      return img
        .split('title=')[1]
        .split("'")[1]
        .replace(' hs.', '')
        .split(' - ');
    })[aqData.length - 1];
    // take hr from aqData and make into proper date
    aqData[1] = moment().startOf('day').add(aqData[1], 'h');
    aqData[1] = moment.tz(
      aqData[1],
      'DD/MM/YYYY HH:mm:ss',
      'America/Argentina/Buenos_Aires'
    );
    // get contaminante, pollutant, and estacion, station. use them in above set** functions
    // when populating measurement
    const $ = cheerio.load(html);
    const contaminante = $('#contaminante').html().split('selected>')[1].split('<')[0];
    const estacion = $('#estacion').html().split('selected>')[1].split('<')[0];
    const measurement = {
      parameter: contaminante === 'PM10' ? 'pm10' : contaminante,
      date: {
        utc: aqData[1].toDate(),
        local: aqData[1].format()
      },
      coordinates: setCoordinates(estacion),
      value: aqData[0],
      unit: setUnits(contaminante),
      attribution: {
        name: 'Buenos Aires Ciudad, Agencia de Protección Ambiental',
        url: 'http://www.buenosaires.gob.ar/agenciaambiental/monitoreoambiental/calidadaire'
      },
      averagingPeriod: setPeriod(contaminante)
    };
    return measurement;
  });

  // merge measurements into one large measurements list
  measurements = [].concat.apply([], measurements);
  const aqObj = {
    name: 'Buenos Aires',
    measurements: measurements
  };
  return aqObj;
};
