/**
 * Creates two new properties, sourceType and mobile
 */

'use strict';

exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('measurements', (table) => {
      table.string('source_type').defaultTo('government');
      table.boolean('mobile').defaultTo(false);
    })
  ]).catch((e) => {
    // Since this takes a lot of time, we'll want to run concurrently on the
    // live db, which we can't do here. So the migration may fail here, so catch
    // the error to be nice.
  });
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('measurements', (table) => {
      table.dropColumns(['source_type', 'mobile']);
    })
  ]);
};
