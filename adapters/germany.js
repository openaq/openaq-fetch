/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the German data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT}); // might be to low, but I have bad wifi on a train, TODO: clarify
import { default as moment } from 'moment-timezone';

exports.name = 'germany';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  request({url: source.url, headers: {'User-Agent': 'OpenAQ'}},
  function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const data = formatData(body);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: e});
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
   * Given a json object, convert to aq openaq format and collect
   * @param {json object} item coming from source data
   */

  const aqRepack = (item) => {
    const appendMeasurement = (val, par) => {
      const dateMoment = moment.tz(item.timestamp, 'YYYY-MM-DD HH:mm', 'Europe/Berlin');
      const template = {
        location: item.location.country,
        city: 'Id' + String(item.location.id), // TODO No source available :(
        parameter: par,
        date: {
          utc: dateMoment.toDate(),
          local: dateMoment.format()
        },
        coordinates: {
          latitude: Number(item.location.latitude),
          longitude: Number(item.location.longitude)
        },
        unit: 'µg/m³',
        value: val,
        attribution: [{name: 'Luftdaten.info', url: 'http://www.luftdaten.info'}],
        averagingPeriod: {unit: 'hours', value: 0.08333}
      };

      measurements.push(template);
    };

    item.sensordatavalues.forEach(measurement => {
      if (measurement.value_type === 'P1') {
        appendMeasurement(Number(measurement.value), 'pm10');
      } else if (measurement.value_type === 'P2') {
        appendMeasurement(Number(measurement.value), ' pm25');
      }
    });
  };

  let measurements = [];
  data.forEach(aqRepack);
  return {name: 'unused', measurements: measurements};
};
