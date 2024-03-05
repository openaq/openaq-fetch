import { dirname } from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sourcesArray = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
			var sources = JSON.parse(fs.readFileSync(`${__dirname}/${f}`));
			// check the name for credentials in the env file
			return sources.map(s => {
					if(s.name) {
							var key = s.name.replace(/[ -]+/g, '_').toUpperCase() + '_CREDENTIALS';
							var cred = process.env[key];
							if(cred) {
									s.credentials = JSON.parse(cred);
							}
					}
					return(s);
			});
	})
  .flat();


export { sourcesArray };
