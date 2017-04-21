/**
 * Migration to add change country for Spartan location.
 * https://github.com/openaq/openaq-fetch/issues/227
 */

require('babel-register');

exports.up = function (knex, Promise) {
  const getMeasurements = function () {
    return knex('measurements')
      .select('country', 'data', 'location', '_id')
      .where('location', 'SPARTAN - CITEDEF');
  };

  const updateMeasurement = function (m) {
    m.data.country = 'AR';
    knex('measurements')
      .where({
        '_id': m._id
      })
      .update({
        'country': 'AR',
        'data': m.data
      })
      .return();
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
  const getMeasurements = function () {
    return knex('measurements')
      .select('country', 'location', '_id')
      .where('location', 'SPARTAN - CITEDEF');
  };

  const rollbackCountry = function (m) {
    m.data.country = 'BR';
    knex('measurements')
      .where({
        '_id': m._id
      })
      .update({
        'country': 'BR',
        'data': m.data
      })
      .return();
  };

  return Promise.all([
    getMeasurements()
      .map(rollbackCountry)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.config = {
  transaction: false
};
