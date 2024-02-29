/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the data sources from New Zealand.
 * adapted from openaq-fetch PR #756 credit to @magsyg
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */

'use strict';

import client from '../lib/requests.js';
import { DateTime } from 'luxon';
import async from 'async';

export const name = 'canterbury';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export function fetchData(source, cb) {
  // Fetches all data for each station for today, data is for each 10 minutes
  const tasks = Object.keys(stations).map((key) => {
    const date = DateTime.local()
      .setZone('Pacific/Auckland')
      .toFormat('dd/MM/yyyy');
    const url = source.url
      .replace('$station', key)
      .replace('$date', date)
      .replace('$date', date);

    return function (cb) {
      client(url)
        .then((response) => {
          let body = JSON.parse(response.body);
          body = body.data.item[body.data.item.length - 1]; // get the last item in the array
          cb(null, [body, stations[key]]);
        })
        .catch((err) => {
          return cb(err);
        });
    };
  });

  // Runs through all of the tasks in parallel
  async.parallel(tasks, function (err, results) {
    if (err) {
      return cb({ message: 'Failure to load data urls.' });
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      let data = formatData(results);
      if (data === undefined) {
        return cb({ message: 'Failure to parse data.' });
      }
      cb(null, data);
    } catch (e) {
      console.log(e);
      return cb({ message: 'Unknown adapter error.' });
    }
  });
}

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */

// Removed 'async' from here
function formatData(results) {
  // Filter out undefined values
  results = results.filter((r) => r[0] !== undefined);
  const measurements = [];

  results.forEach(([itemData, stationData]) => {
    const template = {
      city: stationData.city,
      location: stationData.location,
      coordinates: stationData.coordinates,
      attribution: [
        {
          name: 'Environment Canterbury',
          url: 'https://ecan.govt.nz/',
        },
      ],
      averagingPeriod: { unit: 'minutes', value: 10 },
    };

    const d = itemData;

    // Gets the dateLuxon and correct timezone of time from item
    const dateLuxon = DateTime.fromISO(d.DateTime, {
      zone: 'Pacific/Auckland',
    });

    // Filters out all unwanted data, and then runs through all keys
    Object.keys(d).forEach((m) => {
      if (paramDict[m]) {
        let measurement = {
          date: {
            utc: dateLuxon.toISO({ suppressMilliseconds: true }),
            local: dateLuxon.toISO({ suppressMilliseconds: true }),
          },
          parameter: paramDict[m].param,
          value: parseFloat(d[m]),
          unit: paramDict[m].units,
        };

        measurement = Object.assign({}, measurement, template);
        measurements.push(measurement);
      }
    });
  });

  return {
    name: 'unused',
    measurements: measurements,
  };
}

/* There are a lot of more stations, but they dont seem to be reporting for some reason,
  Managed to find the coordinates from this site (in the script): https://ecan.govt.nz/data/air-quality-data/,
  according to main source site, there should be atleast 30 stations, undefined data is sorted out in formatData
  stations updated 02/17/2023
*/

const stations = {
  1: {
    location: 'St Albans',
    city: 'Christchurch',
    coordinates: {
      latitude: -43.511257,
      longitude: 172.6337,
    },
  },
  2: {
    location: 'Riccarton Road',
    city: 'Christchurch',
    coordinates: {
      latitude: -43.530356,
      longitude: 172.589048,
    },
  },
  3: {
    location: 'Woolston',
    city: 'Christchurch',
    coordinates: {
      latitude: -43.557532,
      longitude: 172.681343,
    },
  },
  4: {
    location: 'Kaiapoi',
    city: 'Kaiapoi',
    coordinates: {
      latitude: -43.384643,
      longitude: 172.652,
    },
  },
  5: {
    location: 'Rangiora',
    city: 'Rangiora',
    coordinates: {
      latitude: -43.307439,
      longitude: 172.594745,
    },
  },
  7: {
    location: 'Ashburton',
    city: 'Ashburton',
    coordinates: {
      latitude: -43.912238,
      longitude: 171.7552,
    },
  },
  9: {
    location: 'Geraldine',
    city: 'Geraldine',
    coordinates: {
      latitude: -44.100188,
      longitude: 171.241443,
    },
  },
  10: {
    location: 'Anzac Square',
    city: 'Timaru',
    coordinates: {
      latitude: -44.404486,
      longitude: 171.249643,
    },
  },
  11: {
    location: 'Washdyke Flat Road',
    city: 'Washdyke',
    coordinates: {
      latitude: -44.356735,
      longitude: 171.2363,
    },
  },
  12: {
    location: 'Waimate Stadium',
    city: 'Waimate',
    coordinates: {
      latitude: -44.735729,
      longitude: 171.0499,
    },
  },
  36: {
    location: 'Christchurch - Burnside',
    city: 'Burnside',
    coordinates: {
      latitude: -43.492848,
      longitude: 172.5931,
    },
  },
  54: {
    location: 'Timaru Grey Rd',
    city: 'Timaru',
    coordinates: {
      latitude: -44.399174,
      longitude: 171.2462,
    },
  },
  64: {
    location: 'Waimate Kennedy',
    city: 'Waimate',
    coordinates: {
      latitude: -44.732595,
      longitude: 171.049778,
    },
  },
  77: {
    location: 'Washdyke Alpine',
    city: 'Timaru',
    coordinates: {
      latitude: -44.356199,
      longitude: 171.242334,
    },
  },
  87: {
    location: 'Christchurch - St Albans EP',
    city: 'St Albans EP',
    coordinates: {
      latitude: -43.508568,
      longitude: 172.635835,
    },
  },
};

const paramDict = {
  PM10_x0020__x0028_ug_x002F_m3_x0029_: {
    param: 'pm10',
    units: 'µg/m³',
  },
  'PM2.5_x0020__x0028_ug_x002F_m3_x0029_': {
    param: 'pm25',
    units: 'µg/m³',
  },
  CO_x0020__x0028_mg_x002F_m3_x0029_: { param: 'co', units: 'mg/m³' },
  NO_x0020__x0028_ug_x002F_m3_x0029_: { param: 'no', units: 'µg/m³' },
  NO2_x0020__x0028_ug_x002F_m3_x0029_: {
    param: 'no2',
    units: 'µg/m³',
  },
  SO2_x0020__x0028_ug_x002F_m3_x0029_: {
    param: 'so2',
    units: 'µg/m³',
  },
};
