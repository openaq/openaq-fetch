/**
 * A batch import script to bring over measurements from mongo, assumes you
 * have a measurements.json in the root directory. Can get this with a
 * command like:
 * mongoexport --db openAQ --collection measurements --out measurements.json --jsonArray
 *
 * This script can be run with the following command:
 * node run-script.js ./data_scripts/batch-impoart.js
 */
'use strict';

let inputFile = 'measurements.json';

var async = require('async');
var _ = require('lodash');
var knex = require('knex');
let knexConfig = require('../knexfile');
var log = require('../lib/logger');
var StreamArray = require('stream-json/utils/StreamArray');
let stream = StreamArray.make();
let fs = require('fs');
let pg;
let st;
let insertCount = 0;
let failureCount = 0;
let batchCount = 100000;
let measurements = [];
let currentIndex;

let buildSQLObject = function (m) {
  let obj = {
    location: m.location,
    value: m.value,
    unit: m.unit,
    parameter: m.parameter,
    country: m.country,
    city: m.city,
    source_name: m.sourceName,
    date_utc: m.date.utc['$date']
  };

  // Copy object JSON to the data field
  obj.data = _.assign({}, m);

  // And we need to spruce it up a bit since it's coming from mongo bson
  delete obj.data._id;
  obj.data.date.utc = obj.data.date.utc['$date'];

  // If we have coordinates, save them with postgis
  if (m.coordinates) {
    obj.coordinates = st.geomFromText(`Point(${m.coordinates.longitude} ${m.coordinates.latitude})`, 4326);
  }

  // And while we're at it, make all attribute fields arrays if they exist
  if (obj.data.attribution && obj.data.attribution instanceof Array === false) {
    log.debug('Converted attribution array', JSON.stringify(obj.data.attribution));
    obj.data.attribution = [obj.data.attribution];
  }

  return obj;
};

let insertRecord = function (measurement) {
  return function (done) {
    let record = buildSQLObject(measurement);
    pg('measurements')
      .returning('_id')
      .insert(record)
      .then(() => {
        insertCount++;
        done(null, {status: 'new'});
      })
      .catch((e) => {
        failureCount++;
        // Log out an error if it's not an failed duplicate insert
        if (e.code === '23505') {
          return done(null, {status: 'duplicate'});
        }

        log.error(e);
        done(e);
      });
  };
};

let importData = function (cb) {
  log.info(`Attempting to insert ${measurements.length} records.`);
  let tasks = measurements.map((m) => {
    return insertRecord(m);
  });
  async.parallelLimit(tasks, 100, (err, results) => {
    if (err) {
      log.error(err);
    }

    log.info(`Processed ${insertCount + failureCount} records, ${insertCount} successes with ${failureCount} failures.`);
    cb();
  });
};

stream.output.on('data', (object) => {
  // log.debug(object.index, object.value);
  currentIndex = object.index;
  measurements.push(object.value);
  if ((object.index + 1) % batchCount === 0) {
    log.debug('Batch count reached, pausing the stream');
    stream.output.pause();
    importData(() => {
      // We're done with an insert batch, start stream again
      measurements = [];
      log.debug('Inserts finished, starting the stream');
      stream.output.resume();
    });
  }
});

stream.output.on('end', () => {
  log.debug('Filestream has ended.');
  // We need to do one last insert since stream has ended, probably not at
  // batch size
  if ((currentIndex + 1) % batchCount !== 0) {
    importData(() => {
      log.info('All done!');
      process.exit(0);
    });
  } else {
    log.info('All done!');
    process.exit(0);
  }
});

// Set up DB and add in postgis features
pg = knex(knexConfig);
st = require('knex-postgis')(pg);
log.info('Connected to database.');

// Run any needed migrations and away we go
pg.migrate.latest(knexConfig)
  .then(() => {
    log.info('Database migrations are handled, ready to roll!');
    fs.createReadStream(inputFile).pipe(stream.input);
  })
  .catch((e) => {
    log.error(e);
  });
