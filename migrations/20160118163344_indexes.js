
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('measurements', (table) => {
      table.index('date_utc');
      table.index('location');
      table.index('city');
      table.index(['location', 'date_utc']);
    })
  ]);
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('measurements', (table) => {
      table.dropIndex('date_utc');
      table.dropIndex('location');
      table.dropIndex('city');
      table.dropIndex(['location', 'date_utc']);
    })
  ]);
};
