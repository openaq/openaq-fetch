/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for Trento region in Italy data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'arpaeT';

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
    data = data.stazione;
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }

  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} da A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var parseDate = function (date) {
    date = moment.tz(date, 'YYYY-MM-DDHH:mm', 'Europe/Vaduz');
    return {utc: date.toDate(), local: date.format()};
  };

  /**
   * method for getting locationdata for the station
   * @param {string} location the location of the station
   * @return {object} object with city, and geolocation
   */
  const getLocation = function (location) {
    switch (location) {
      case ('Parco S. Chiara') :
        return {city: 'Trento', latitude: 46.063461, longitude: 11.126197};
      case ('Via Bolzano') :
        return {city: 'Trento', latitude: 46.104802, longitude: 11.109822};
      case ('Piana Rotaliana') :
        return {city: 'Mezzocorona', latitude: 46.228022, longitude: 11.132869};
      case ('Rovereto') :
        return {city: 'Rovereto', latitude: 45.891171, longitude: 11.041173};
      case ('Borgo Valsugana') :
        return {city: 'Borgo Valsugana', latitude: 46.051657, longitude: 11.454880};
      case ('Riva del Garda') :
        return {city: 'Riva del Garda', latitude: 45.893034, longitude: 10.847765};
      case ('A22 (Avio)') :
        return {city: 'Avio', latitude: 45.730380, longitude: 10.943382};
      case ('Monte Gaza') :
        return {city: 'Monte Gaza', latitude: 46.086309, longitude: 10.991845};
    }
  };
  var measurements = [];
  // loop through all stations
  data.forEach(station => {
    const loc = getLocation(station.nome);
    // the base object for the stationinfo
    const base = {
      location: (station.indirizzo !== null && String(station.indirizzo).length > 0) ? station.indirizzo : loc.city,
      city: loc.city,
      coordinates: {
        latitude: loc.latitude,
        longitude: loc.longitude
      },
      unit: 'µg/m³',
      attribution: [{name: 'Arpae Trento', url: 'http://www.appa.provincia.tn.it/'}],
      averagingPeriod: {unit: 'hours', value: 1}
    };
    // the date + hour to get when the data was recorded, the latest are often the day after the date given
    const date = Object.getOwnPropertyNames(station.dati)[0];
    for (let i = 0; i < 24; i++) {
      const values = station.dati[date][i];
      const dateMoment = moment(date).add(Number(Object.getOwnPropertyNames(station.dati[date])[i]), 'hours');
      for (var key in values) {
        if (values.hasOwnProperty(key)) {
          var m = Object.assign({
            parameter: key,
            value: values[key],
            date: parseDate(dateMoment)
          }, base);
          measurements.push(m);
        }
      }
    }
  });

  return {name: 'unused', measurements: measurements};
};
