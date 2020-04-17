// Create upload_tokens table
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('upload_tokens', function (table) {
      table.increments();
      table.string('token');
    })
  ]);
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('upload_tokens')
  ]);
};
