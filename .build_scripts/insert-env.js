'use strict';

const input = '.build_scripts/ecs-task-definition.json';
const output = 'ecs-task-generated.json';
const envFile = 'local.env';

console.info('Inserting env variables into ECS task definition.');

let fs = require('fs');

// Load in intitial JSON
let obj = JSON.parse(fs.readFileSync(input, 'utf8'));

// Add in env variables, split on newline and remove any extra empty things
// hanging around.
let envs = fs.readFileSync(envFile, 'utf8');
let splitEnvs = [];
envs.split('\n').forEach(function (e) {
  if (e) {
    let idx = e.indexOf('=');
    splitEnvs.push({ 'name': e.substr(0, idx), 'value': e.substr(idx + 1, e.length) });
  }
});
obj['containerDefinitions'][0]['environment'] = splitEnvs;

// Handle special case for CONTAINER_MEMORY if it exists
splitEnvs.forEach(function (e) {
  if (e.name === 'CONTAINER_MEMORY') {
    obj['containerDefinitions'][0]['memory'] = Number(e.value);
  }
})

// Also set container version based on hash
let hash = 'latest';
if (process.env.TRAVIS_COMMIT) {
  hash = process.env.TRAVIS_COMMIT;
} else if (process.env.CURRENT_HASH) {
  hash = process.env.CURRENT_HASH.split(':')[1];
}
obj['containerDefinitions'][0]['image'] += ':' + hash;

// And set the family name based on env var
splitEnvs.forEach(function (e) {
  if (e.name === 'ECS_TASK_NAME') {
    obj['family'] = e.value;
  }
});

// Save to output file
fs.writeFileSync(output, JSON.stringify(obj));
console.info('Inserted env variables into ECS task definition.');
