/**
 * Creates an index for coordinates
 */

'use strict';

exports.up = function (knex, Promise) {
  return Promise.all([
    knex.raw('CREATE INDEX measurements_coordinates_index ON measurements USING GIST (coordinates);')
  ]).catch((e) => {
    // Since this takes a lot of time, we'll want to run concurrently on the
    // live db, which we can't do here. So the index may already be created
    // when this runs, so catch the error to be nice.
  });
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('measurements', (table) => {
      table.dropIndex('coordinates');
    })
  ]);
};
