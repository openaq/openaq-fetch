/**
 * Migration to fix Sao Paulo city names. If a city name is not available,
 * the location is used.
 * https://github.com/openaq/openaq-fetch/issues/97
 */

import 'babel-register';
import { stationsCities } from '../adapters/saopaulo.js';

const country = 'BR';
const city = 'Sao Paulo';

exports.up = function (knex, Promise) {
  var getLocations = function () {
    return knex('measurements')
      .select(knex.raw('distinct on (location) location, city, data'))
      .orderBy('location')
      .where({
        'country': country,
        'city': city
      });
  };

  var updateLocation = function (row) {
    const newCity = stationsCities[row.location] || row.location;
    row.data.city = newCity;
    knex('measurements')
      .where({
        'country': country,
        'city': city,
        'location': row.location
      })
      .update({
        'city': newCity,
        'data': row.data
      })
      .return();
  };

  return Promise.all([
    getLocations()
      .map(updateLocation)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.down = function (knex, Promise) {
  const locations = Object.keys(stationsCities);

  const rollbackCity = function (row) {
    row.data.city = city;

    knex('measurements')
      .where({
        'country': country,
        'location': row.location
      })
      .update({
        'city': city,
        'data': row.data
      })
      .return();
  };

  const getLocations = function () {
    return knex('measurements')
      .select(knex.raw('distinct on (location) location, data'))
      .orderBy('location')
      .whereIn('location', locations)
      .andWhere('country', country);
  };

  return Promise.all([
    getLocations()
      .map(rollbackCity)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.config = {
  transaction: false
};
