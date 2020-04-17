
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('measurements', (table) => {
      table.dropColumn('date_local');
    })
  ]);
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('measurements', (table) => {
      table.dateTime('date_local');
    })
  ]);
};
