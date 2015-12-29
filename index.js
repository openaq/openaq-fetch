'use strict';

// only ES5 is allowed in this file
require('babel-register')({
  presets: [ 'es2015' ]
});

// other babel configuration, if necessary

// load the server
require('./fetch');
