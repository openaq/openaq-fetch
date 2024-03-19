import { dirname } from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sourcesArray = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
			let sources = JSON.parse(fs.readFileSync(`${__dirname}/${f}`));
			// so that we can include the file path in the error
			return sources.map(s =>({ file: f, ...s }));
	})
  .flat();

export { sourcesArray };
