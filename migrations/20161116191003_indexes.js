/**
 * Creates a better index for the latest/locations aggregation
 */

'use strict';

exports.up = function (knex, Promise) {
  return Promise.all([
    knex.raw('create index measurements_location_city_parameter_source_name_date_utc on measurements (location, city, parameter, source_name, date_utc);')
  ]).catch((e) => {
    // Since this takes a lot of time, we'll want to run concurrently on the
    // live db, which we can't do here. So the index may already be created
    // when this runs, so catch the error to be nice.
  });
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('measurements', (table) => {
      table.dropIndex(['location', 'city', 'parameter', 'source_name', 'date_utc']);
    })
  ]);
};
