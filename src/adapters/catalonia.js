/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Catalonian data sources.
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
  // Due to the catalonian datesource being massive and unsorted, only fetches for current day
  const fetchURL = (source.url )//+ '?any=' + moment().year().toString() + '&mes=' + (moment().month() + 1).toString() + '&dia=' + (moment().date()).toString());
  console.log(moment().year().toString() + '-' + (moment().month() + 1).toString() + '-' + (moment().date()).toString());
  request(fetchURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body);
      console.log(data)

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
const formatData = function (data) {
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
        String(param).localeCompare('no') !== 0 &&
        String(param).localeCompare('c6h6') !== 0 &&
        String(param).localeCompare('cl2') !== 0 &&
        String(param).localeCompare('hg') !== 0 &&
        String(param).localeCompare('pm1') !== 0) {
      const template = {
        location: ('nom_estaci' in item) ? item.nom_estaci : item.municipi,
        city: item.municipi,
        parameter: param,
        coordinates: {
          latitude: Number(item.latitud),
          longitude: Number(item.longitud)
        },
        unit: item.unitats,
        attribution: [{name: 'GENCAT', url: 'http://mediambient.gencat.cat/ca/05_ambits_dactuacio/atmosfera/qualitat_de_laire/vols-saber-que-respires/visor-de-dades/'}],
        averagingPeriod: {unit: 'hours', value: 1}
      };
        // Loop through all hours and check if there is any data for that hour on that day
      for (let i = 1; i < 25; i++) {
        dateMoment = moment(dateMoment).add(1, 'hours').format('YYYY-MM-DD HH:mm');
        dateMoment = moment.tz(dateMoment, 'YYYY-MM-DD HH:mm', 'Europe/Madrid');
        let valueKey = (i < 10) ? ('h0' + i.toString()) : ('h' + i.toString());
        if (valueKey in item) {
          let temp = Object.assign({
            value: Number(item[valueKey]),
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
  function concatAll (list) {
    let results = [];
    list.forEach(function (subArray) {
      subArray.forEach(function (subArrayValue) {
        results.push(subArrayValue);
      });
    });
    return results;
  }
  const measurements = concatAll(Object.values(data.map(aqRepack)));
  return {name: 'unused', measurements: measurements};
};
