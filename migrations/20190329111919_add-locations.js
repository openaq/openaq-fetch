exports.up = function (knex) {
  return knex.schema.createTable('locations', function (table) {
    table.string('id').primary();
    table.string('country');
    table.text('city');
    table.specificType('cities', 'text ARRAY');
    table.text('location');
    table.specificType('locations', 'text ARRAY');
    table.text('sourceName');
    table.specificType('sourceNames', 'text ARRAY');
    table.text('sourceType');
    table.specificType('sourceTypes', 'text ARRAY');
    table.decimal('lon', null);
    table.decimal('lat', null);
    table.specificType('coordinates', 'GEOGRAPHY(Point, 4326)');
    table.dateTime('firstUpdated');
    table.dateTime('lastUpdated');
    table.specificType('parameters', 'text ARRAY');
    table.specificType('countsByMeasurement', 'json ARRAY');
    table.integer('count');
    table.index(['country', 'lon', 'lat']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('locations');
};
