/**
 * Migration to add missing Chinese coordinates.
 * https://github.com/openaq/openaq-fetch/issues/147
 */

import 'babel-register';
import { getCoordinates } from '../adapters/beijing.js';

exports.up = function (knex, Promise) {
  const getMeasurements = function () {
    return knex('measurements')
      .select('coordinates', 'data', 'location', '_id')
      .where('country', 'CN')
      .andWhere('location', 'Beijing US Embassy')
      .orWhere('location', 'Chengdu')
      .orWhere('location', 'Guangzhou')
      .orWhere('location', 'Shenyang')
      .orWhere('location', 'Shanghai');
  };

  const updateMeasurement = function (m) {
    const coords = getCoordinates(m.location);
    if (coords) {
      m.data.coordinates = coords;
      knex('measurements')
        .where({
          '_id': m._id
        })
        .update({
          'coordinates': knex.raw(`ST_GeomFromText('Point(${coords.longitude} ${coords.latitude})', 4326)`),
          'data': m.data
        })
        .return();
    }
  };

  return Promise.all([
    getMeasurements()
      .map(updateMeasurement)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.down = function (knex, Promise) {
  const rollbackCoordinates = function (m) {
    delete m.data.coordinates;
    knex('measurements')
      .where({
        '_id': m._id
      })
      .update({
        'coordinates': null,
        'data': m.data
      })
      .return();
  };

  const getMeasurements = function () {
    return knex('measurements')
      .select('coordinates', 'data', 'location', '_id')
      .where('country', 'CN')
      .andWhere('location', 'Beijing US Embassy')
      .orWhere('location', 'Chengdu')
      .orWhere('location', 'Guangzhou')
      .orWhere('location', 'Shenyang')
      .orWhere('location', 'Shanghai');
  };

  return Promise.all([
    getMeasurements()
      .map(rollbackCoordinates)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.config = {
  transaction: false
};
