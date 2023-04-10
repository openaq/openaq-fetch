import knex from 'knex';
import config from '../knexfile.js';
import sources from '../src/sources/index.cjs';

const db = knex(config);

console.log(`There are currently ${sources.length} sources locally`);

// check to see what keys are in the sources
// console.log(
//   sources.map(data => Object.keys(data))
//     .flat()
//     .reduce((acc, curr) => {
//       acc[curr] = -~acc[curr];
//       return acc;
//     }, {})
// );

// reshape to match what is in the database
const sources_db = sources
      .filter(d => d.name!='test_adapter')
      .map(data => {
  let interval;
  switch (data.resolution) {
  case '10 min':
    interval = 10;
    break;
  case '15 min':
    interval = 15;
    break;
  default:
    interval = 60;
  }
  data.interval = interval;
  return {
    label: data.name,
    description: data.description,
    source_name: data.name,
    export_prefix: data.adapter,
    adapter: data.adapter,
    active: data.active,
    metadata: data,
  };
});


(async () => {

  if(!(await db.schema.hasTable('providers_temp'))) {
    await db.schema.createTable('providers_temp', table => {
      table.string('label');
      table.string('description');
      table.string('source_name');
      table.string('export_prefix');
      table.string('adapter');
      table.boolean('active');
      table.json('metadata');
    });
  };

  let upserts = await db('providers_temp')
      .insert(sources_db)
      .returning("*");

  await db.raw(
    `INSERT INTO adapters (name, description, handler)
     SELECT adapter
     , 'Automatically added from fetcher data'
     , 'openaq-fetch'
     FROM providers_temp
     ON CONFLICT DO NOTHING`
  );

  await db.raw(
    `UPDATE providers
     SET metadata = p.metadata
     , is_active = p.active
     FROM providers_temp p
     WHERE providers.source_name = p.source_name`
  );

  await db.raw(
    `UPDATE providers
     SET adapters_id = a.adapters_id
     FROM adapters a
     WHERE providers.metadata->>'adapter' = a.name`
  );

  await db.schema.dropTable('providers_temp');

  console.log(`Upserted ${upserts.length} providers to the db`);

  // example showing how to just query the table
  // let rows = await db('sources_tmp');

  process.exit(0);
})();
