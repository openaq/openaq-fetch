
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('measurements', function (table) {
      table.bigIncrements('_id');
      table.string('location');
      table.float('value');
      table.string('unit');
      table.string('parameter');
      table.string('country');
      table.string('city');
      table.json('data');
      table.string('source_name');
      table.dateTime('date_local');
      table.dateTime('date_utc');
      table.specificType('coordinates', 'GEOGRAPHY(Point, 4326)');
      table.unique(['location', 'city', 'parameter', 'date_utc']);
    })
  ]);
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('measurements')
  ]);
};
