/* global describe, it */

const {exec} = require('child_process');
const {resolve} = require('path');

const expect = require('chai').expect;

function execp (cmd, cwd = resolve(__dirname, '../../')) {
  return new Promise((resolve, reject) => {
    exec(cmd, {cwd}, (err, stdout, stderr) => {
      if (err) reject(err);

      resolve(stdout);
    });
  });
}

describe('Testing fetch operation', function () {
  describe('dummy adapter test', async function () {
    it('should fetch 7 items for test adapter', async function () {
      const out = await execp('node . -dvs test_adapter');

      expect(out).to.include('itemsInserted=7');
    });
  });
});
