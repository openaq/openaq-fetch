/**
 * A simple wrapper to run arbitrary code using ES6
 */
'use strict';

// only ES5 is allowed in this file
require('babel-register')({
  presets: [ 'es2015' ]
});

// other babel configuration, if necessary

console.log('Running the script: ' + process.argv[2]);
require(process.argv[2]);
