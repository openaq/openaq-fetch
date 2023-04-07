import * as fs from 'fs';

const sourcesArray = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.json'))
  .map((f) => require(`./${f}`))
  .flat();

export { sourcesArray };
