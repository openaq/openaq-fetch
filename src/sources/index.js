import { dirname } from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sourcesArray = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(`${__dirname}/${f}`)))
  .flat();

export { sourcesArray };
