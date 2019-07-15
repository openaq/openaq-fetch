exports.up = function (knex) {
  return knex.schema.createTable('locations_metadata', function (table) {
    table.increments('id').primary();
    table.string('locationId').notNullable();
    table.timestamp('createdAt').defaultTo(knex.fn.now());
    table.string('userId');
    table.jsonb('data');

    table.index('locationId');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('locations_metadata');
};
