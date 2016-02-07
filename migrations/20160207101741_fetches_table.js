// Create fetches table
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('fetches', function (table) {
      table.increments();
      table.dateTime('time_started');
      table.dateTime('time_ended');
      table.integer('count');
      table.json('results');
    })
  ]);
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('fetches')
  ]);
};
