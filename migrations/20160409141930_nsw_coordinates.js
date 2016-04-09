/**
 * Migration to add NSW coordinates.
 * https://github.com/openaq/openaq-fetch/issues/142
 */

import 'babel-register';
import { coordinates } from '../adapters/nsw.js';

const country = 'AU';

exports.up = function (knex, Promise) {
  var getLocations = function () {
    return knex('measurements')
      .select(knex.raw('distinct on (location) location, data'))
      .where({
        'country': country
      });
  };

  var updateLocation = function (row) {
    const coords = coordinates[row.location];
    if (coords) {
      row.data.coordinates = coords;
      knex('measurements')
        .where({
          'country': country,
          'location': row.location
        })
        .update({
          'coordinates': knex.raw(`ST_GeomFromText('Point(${coords.longitude} ${coords.latitude})', 4326)`),
          'data': row.data
        })
        .return();
    }
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
  const rollbackCoordinates = function (row) {
    delete row.data.coordinates;
    knex('measurements')
      .where({
        'country': country
      })
      .update({
        'coordinates': null,
        'data': row.data
      })
      .return();
  };

  const getLocations = function () {
    return knex('measurements')
      .select('data')
      .where({
        'country': country
      });
  };

  return Promise.all([
    getLocations()
      .map(rollbackCoordinates)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.config = {
  transaction: false
};
