/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Norwegian data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'norway';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
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
    const dateMoment = moment.tz(item.toTime, 'YYYY-MM-DD HH:mm', 'Europe/Oslo');
    const template = {
      location: item.station,
      city: item.area,
      parameter: item.component.toLowerCase().replace('.', ''),
      date: {
        utc: dateMoment.toDate(),
        local: dateMoment.format()
      },
      coordinates: {
        latitude: item.latitude,
        longitude: item.longitude
      },
      value: Number(item.value),
      unit: item.unit,
      attribution: [{name: 'Luftkvalitet.info', url: 'http://www.luftkvalitet.info/home.aspx'}],
      averagingPeriod: {unit: 'hours', value: 1}
    };

    return template;
  };

  const measurements = data.map(aqRepack);
  return {name: 'unused', measurements: measurements};
};
