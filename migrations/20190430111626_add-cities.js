exports.up = function (knex) {
  return knex.schema.createTable('cities', function (t) {
    t.string('country').notNullable();
    t.string('name').notNullable();
    t.integer('count'); // measurements count
    t.integer('locations'); // locations count
    t.unique(['country', 'name']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('cities');
};
