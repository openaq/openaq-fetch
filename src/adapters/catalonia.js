/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Catalonian data sources. credit to @magsyg
 * based off of openaq-fetch PR #711 
 */

'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as baseRequest } from 'request';
import { DateTime } from 'luxon';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'catalonia';

export function fetchData (source, cb) {
  const fetchURL = (source.url)
  request(fetchURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    try {
      const data = formatData(body);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

function formatData(data) {
  try {
    data = JSON.parse(data);
  } catch (e) {
    return undefined;
  }

  const aqRepack = (item) => {
    let aq = [];
    let dateLuxon = DateTime.fromISO(item.data, { zone: 'Europe/Madrid' });
    const param = item.contaminant.toLowerCase().replace('.', '');

    if (String(param).localeCompare('h2s') !== 0 &&
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

      for (let i = 1; i < 25; i++) {
        dateLuxon = dateLuxon.plus({ hours: 1 });
        let valueKey = (i < 10) ? ('h0' + i.toString()) : ('h' + i.toString());
        if (valueKey in item) {
          let temp = Object.assign({
            value: parseFloat(item[valueKey]),
            date: {
              utc: dateLuxon.toUTC().toJSDate(),
              local: dateLuxon.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ") 
            }
          }, template);

          aq.push(temp);
        }
      }
    }
    return aq;
  };

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
  let measurements = getLatestMeasurements(allData);  
  measurements = filterDuplicates(measurements, eeaCataloniaDuplicateStations) // remove duplicates of EEA stations!
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
// remove stations deemed to be duplicates of EEA stations
function filterDuplicates(measurements, criteria) {
  return measurements.filter(measurement => {
    return !criteria.some(criterion => {
      const matchLocation = measurement.location === criterion.location;
      const matchCoordinates =
        measurement.coordinates.latitude === criterion.coordinates.latitude &&
        measurement.coordinates.longitude === criterion.coordinates.longitude;
      return matchLocation && matchCoordinates;
    });
  });
}

// this deny list is used to exclude stations that are within 0.1 km of an EEA station
const eeaCataloniaDuplicateStations = [
  {
      "location": "Alcover",
      "coordinates": {
        "latitude": 41.278687,
        "longitude": 1.1798977
      }
    },
    {
      "location": "Viladecans",
      "coordinates": {
        "latitude": 41.31335,
        "longitude": 2.0136087
      }
    },
    {
      "location": "Tona",
      "coordinates": {
        "latitude": 41.84666,
        "longitude": 2.2175014
      }
    },
    {
      "location": "Sort",
      "coordinates": {
        "latitude": 42.405407,
        "longitude": 1.1299014
      }
    },
    {
      "location": "Barcelona",
      "coordinates": {
        "latitude": 41.37878,
        "longitude": 2.133099
      }
    },
    {
      "location": "Tarragona",
      "coordinates": {
        "latitude": 41.15951,
        "longitude": 1.2396973
      }
    },
    {
      "location": "Barcelona",
      "coordinates": {
        "latitude": 41.386406,
        "longitude": 2.1873982
      }
    },
    {
      "location": "Barcelona",
      "coordinates": {
        "latitude": 41.42611,
        "longitude": 2.1480017
      }
    },
    {
      "location": "Sabadell",
      "coordinates": {
        "latitude": 41.561214,
        "longitude": 2.1011107
      }
    }
  ]