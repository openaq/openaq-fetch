// Create fetches table
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('sources', function (table) {
      table.increments();
      table.json('data');
    })
  ]);
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('sources')
  ]);
};
