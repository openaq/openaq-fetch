/**
 * @fileoverview
 *
 * Usage: `$ node .build_scripts/bench-adapters > docs/adapter-benchmark.md
 *
 * The program executes openaq-fetch for each adapter separately and records
 * the cpu and memory usage as well as total time of execution.
 *
 * The output is in markdown format.
 */

import { cpus, totalmem } from 'os';
import { exec } from 'child_process';
import escape from 'shell-escape';

import { DataStream } from 'scramjet';

import sources from '../sources';
import { handleUnresolvedPromises } from '../lib/errors';

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
  }).then(({exitCode, stdout, stderr}) => {
    const lines = stderr.split(/\n/);
    lines.pop();
    const measurements = +(stdout.split(/\n/).find(x => x.indexOf('New measurements found') > -1) || '0').replace(/^.*:\s(\d+)$/, '$1');

    const mline = lines.pop();
    const data = mline.split('\t').reduce((out, x) => {
      const [key, val] = x.split('=');
      if (key && val) out[key] = val;
      return out;
    }, {exitCode, measurements});

    return data;
  });
}

function mkHead() {
  const cpuModel = cpus()[0].model;
  const memGbs = Math.round(totalmem() / 2 ** 30);
  const created = new Date().toUTCString();

  return `
---
created_at: ${created}
CPU: ${cpuModel}
RAM: ${memGbs}GB
---

# Adapters benchmark

Benchmark executed at ${created} on a ${cpuModel} machine with ${memGbs} GB of RAM.

Results are:

`
}

process.stdout.write(mkHead());

DataStream
  // create a DataStream from sources
  .fromArray(Object.values(sources).sort((a,b) => a.adapter === b.adapter ? 0 : a.adapter > b.adapter ? -1 : 1))
  // flatten the sources
  .flatten()
  // set parallel limits
  .setOptions({maxParallel: +process.argv[2] || cpus().length})
  // run operations on each source, return stream of results
  .map(
    async ({name, adapter, active, country}) => {
      console.error(`Starting test of adapter "${adapter}" on source "${name}"`);
      const outcome = await runSource({name});
      console.error(`Done test of adapter "${adapter}" on source "${name}"`);
      return Object.assign({name, adapter, active, country}, outcome);
    }
  )
  .stringify(
    (data) => `### source "${data.name}"\n\n`+Object.entries(data).map(
      ([k, v]) => `* ${k}: ${v}\n`
    ).join('') + '\n'
  )
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
