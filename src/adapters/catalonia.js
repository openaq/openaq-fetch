/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Catalonian data sources. credit to @magsyg
 * based off of openaq-fetch PR #711 
 */

'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'catalonia';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
export function fetchData (source, cb) {
  const fetchURL = (source.url)
  request(fetchURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    try {
      // Format the data
      const data = formatData(body);
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

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */

function formatData(data) {
  // Wrap the JSON.parse() in a try/catch in case it fails
  try {
    data = JSON.parse(data);
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }
  /**
   * Given a json object, convert to aq openaq format
   * @param {json object} item coming from source data
   * @return {object} a repacked object
   */
  const aqRepack = (item) => {
    let aq = [];
    let dateMoment = moment.tz(item.data, 'YYYY-MM-DD HH:mm', 'Europe/Madrid');
    const param = item.contaminant.toLowerCase().replace('.', '');
    // Filtering out params that are not requested, this filter can be removed if desired
    if (String(param).localeCompare('nox') !== 0 &&
      String(param).localeCompare('h2s') !== 0 &&
      String(param).localeCompare('c6h6') !== 0 &&
      String(param).localeCompare('cl2') !== 0 &&
      String(param).localeCompare('hg') !== 0) {

      const template = {
        location: ('nom_estaci' in item) ? item.nom_estaci : item.municipi,
        city: item.municipi,
        parameter: param,
        coordinates: {
          latitude: parseFloat(item.latitud),
          longitude: parseFloat(item.longitud)
        },
        unit: item.unitats,
        attribution: [{ name: 'GENCAT', url: 'https://mediambient.gencat.cat/ca/05_ambits_dactuacio/atmosfera/qualitat_de_laire/vols-saber-que-respires/visor-de-dades/' }],
        averagingPeriod: { unit: 'hours', value: 1 }
      };

      // Loop through all hours and check if there is any data for that hour on that day
      for (let i = 1; i < 25; i++) {
        dateMoment = moment(dateMoment).add(1, 'hours').format('YYYY-MM-DD HH:mm');
        dateMoment = moment.tz(dateMoment, 'YYYY-MM-DD HH:mm', 'Europe/Madrid');
        let valueKey = (i < 10) ? ('h0' + i.toString()) : ('h' + i.toString());
        if (valueKey in item) {
          let temp = Object.assign({
            value: parseFloat(item[valueKey]),
            date: {
              utc: dateMoment.toDate(),
              local: dateMoment.format()
            }
          }, template);

          aq.push(temp);
        }
      }
    }
    // Returning all values for that day
    return aq;
  };
  // Needed to make all the lists from each day into one big array instead of multiple lists
  function concatAll(list) {
    let results = [];
    list.forEach(function (subArray) {
      subArray.forEach(function (subArrayValue) {
        results.push(subArrayValue);
      });
    });
    return results;
  }
  const allData = concatAll(Object.values(data.map(aqRepack)));
  const measurements = getLatestMeasurements(allData);  

  return { name: 'unused', measurements: measurements };
}

const getLatestMeasurements = function (measurements) {
  const latestMeasurements = {};
  
  measurements.forEach((measurement) => {
    const key =  measurement.location + ' ' + measurement.parameter;
    if (!latestMeasurements[key] || measurement.date.local > latestMeasurements[key].date.local) {
      latestMeasurements[key] = measurement;
    }
  });
  return Object.values(latestMeasurements);
}
