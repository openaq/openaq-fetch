exports.up = function (knex, Promise) {
  return knex.schema.table('locations_metadata', (table) => {
    table.float('completeness');
  });
};

exports.down = function (knex, Promise) {
  return knex.schema.table('locations_metadata', (table) => {
    table.dropColumn('completeness');
  });
};
