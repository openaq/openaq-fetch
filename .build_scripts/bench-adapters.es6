import { cpus } from 'os';
import { exec } from 'child_process';
import escape from 'shell-escape';

import { DataStream } from 'scramjet';

import sources from '../sources';
import { handleUnresolvedPromises } from '../lib/utils';

async function runSource ({ name }) {
  const cmd = escape(['/usr/bin/time', '-f', 'cmd=%C\texit_code=%x\ttime_sys=%S\ttime_user=%U\ttime_elapsed=%e\tmax_mem=%M\tavg_mem=%K\tavg_stack=%p\tavg_data=%D\tavg_rss=%t\tsock_in=%r\tsock_out=%s\tfs_in=%I\tfs_out=%O\tcpu_percent=%P', process.argv[0], '../', '-d', '-s', name]);
  const options = {
    cwd: __dirname,
    env: {
      LOG_LEVEL: 'info',
      LOG_COLOR: 'false'
    }
  };

  return new Promise((resolve) => {
    exec(cmd, options, (err, stdout, stderr) => {
      resolve({exitCode: err ? err.code : 0, stdout, stderr});
    });
  }).then(({stdout, stderr}) => {
    const lines = stderr.split(/\n/);
    lines.pop();
    const measurements = +(stdout.split(/\n/).find(x => x.indexOf('New measurements inserted') > -1) || '0').replace(/^.*\s(\d+)$/, '$1');

    const mline = lines.pop();
    const data = mline.split('\t').reduce((out, x) => {
      const [key, val] = x.split('=');
      if (key && val) out[key] = val;
      return out;
    }, {measurements});

    return data;
  });
}

DataStream
  // create a DataStream from sources
  .fromArray(Object.values(sources))
  // flatten the sources
  .flatten()
  // set parallel limits
  .setOptions({maxParallel: +process.argv[2] || cpus().length})
  // run operations on each source, return stream of results
  .map(
    async ({name, adapter, active, country}) => {
      const outcome = await runSource({name});
      return Object.assign({name, adapter, active, country}, outcome);
    }
  )
  .CSVStringify()
  .pipe(process.stdout);

handleUnresolvedPromises(true)
  .catch(
    (error) => {
      console.error(`Runtime error occurred in ${error.stream && error.stream.name}: ${error.stack}`);
      return (error && error.exitCode) || 100;
    }
  )
  .then(
    exitCode => process.exit(exitCode)
  )
;
