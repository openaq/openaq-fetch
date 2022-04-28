import knex from 'knex';
import config from '../knexfile.js';
import sources from '../src/sources/index.cjs';

const db = knex(config);

console.log(`There are currently ${sources.length} sources locally`);

// check to see what keys are in the sources
console.log(
  sources.map(data => Object.keys(data))
    .flat()
    .reduce((acc, curr) => {
      acc[curr] = -~acc[curr];
      return acc;
    }, {})
);

// reshape to match what is in the database
const sources_db = sources.map(data => {
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
    metadata: data,
  };
});

(async () => {
  let upserts = await db('providers')
      .insert(sources_db)
      .onConflict("source_name")
      .merge(['metadata'])
      .returning("*");

  console.log(`Upserted ${upserts.length} providers to the db`);

  // example showing how to just query the table
  // let rows = await db('sources_tmp');

  process.exit(0);
})();
