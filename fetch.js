/**
 * This is the main code to kick off the data fetching processes, handle their
 * results, saving to a database and repeating the process... forever.
 *
 * There are helpful command line shortcuts, all described with
 * `node index.js --help`.
 */
'use strict';

// Set up command line arguments
var argv = require('yargs')
  .usage('Usage: $0 --dryrun --source \'Beijing US Embassy\'')
  .boolean('dryrun')
  .describe('dryrun', 'Run the fetch process but do not attempt to save to the database and instead print to console, useful for testing.')
  .alias('d', 'dryrun')
  .describe('source', 'Run the fetch process with only the defined source using source name.')
  .alias('s', 'source')
  .nargs('source', 1)
  .help('h')
  .alias('h', 'help')
  .argv;

var async = require('async');
import { assign, filter, pick, chain, find } from 'lodash';
var knex = require('knex');
let knexConfig = require('./knexfile');
var utils = require('./lib/utils');
var request = require('request');
var log = require('./lib/logger');

var adapters = require('./adapters');
var sources = require('./sources');

const apiURL = process.env.API_URL || 'http://localhost:3004/v1/webhooks';  // The url to ping on completion
const webhookKey = process.env.WEBHOOK_KEY || '123';  // Secret key to auth with API
const processTimeout = process.env.PROCESS_TIMEOUT || 10 * 60 * 1000; // Kill the process after a certain time in case it hangs
let pg;
let st;

// This is a top-level safety mechanism, we'll kill this process after a certain
// time in case it's hanging. Intended to avoid https://github.com/openaq/openaq-fetch/issues/154
setTimeout(() => {
  log.error('Uh oh, process timed out.');
  process.exit(1);
}, processTimeout);

// Flatten the sources into a single array, taking into account sources argument
sources = chain(sources).values().flatten().value();
if (argv.source) {
  sources = find(sources, { name: argv.source });

  // Check here to make sure we have at least one valid source
  if (!sources) {
    log.error('I\'m sorry Dave, I searched all known sources and can\'t ' +
      'find anything for', argv.source);
    process.exit(1);
  }

  // Make it a single element array to play nicely downstream
  sources = [sources];
}

/**
 * Find the adapter for a given source
 * @param {string} name An adapter name
 * @return {Adapter} The associated adapter
 */
var findAdapter = function (name) {
  return find(adapters, function (a) {
    return a.name === name;
  });
};

/**
* Ping openaq-api to let it know data fetching is complete
* @param {function} cb A function of form func(error) called on completion
*/
var sendUpdatedWebhook = function (cb) {
  var form = {
    key: webhookKey,
    action: 'DATABASE_UPDATED'
  };
  request.post(apiURL, {form: form}, function (err, res, body) {
    if (err) {
      cb(err);
    }

    cb(null);
  });
};

/**
 * Build an object that can be inserted into our database.
 * @param {object} m measurement object
 * @return {object} an object capable of being saved into the PostgreSQL database
 */
let buildSQLObject = function (m) {
  let obj = {
    location: m.location,
    value: m.value,
    unit: m.unit,
    parameter: m.parameter,
    country: m.country,
    city: m.city,
    source_name: m.sourceName,
    date_utc: m.date.utc,
    source_type: m.sourceType,
    mobile: m.mobile
  };
  // Copy object JSON to the data field
  obj.data = assign({}, m);
  // If we have coordinates, save them with postgis
  if (m.coordinates) {
    obj.coordinates = st.geomFromText(`Point(${m.coordinates.longitude} ${m.coordinates.latitude})`, 4326);
  }

  return obj;
};

/**
 * Create a function to ask the adapter for data, verify the data and attempt
 * to save to a database when appropriate (i.e., not running with `--dryrun`).
 * @param {object} source A source object
 * @return {function} The function to make the magic happen
 */
var getAndSaveData = function (source) {
  // Generates a formatted message based on fetch results
  let generateResultsMessage = function (newResults, source, failures, fetchStarted, fetchEnded, isDryrun = false) {
    return {
      message: `${isDryrun ? '[Dry Run] ' : ''}New measurements inserted for ${source.name}: ${newResults}`,
      failures: failures,
      count: newResults,
      duration: (fetchEnded - fetchStarted) / 1000,
      sourceName: source.name
    };
  };

  return function (done) {
    // Get the appropriate adapter
    var adapter = findAdapter(source.adapter);
    if (!adapter) {
      const msg = generateResultsMessage(0, source, {'Could not find adapter.': 1}, 0, 0, argv.dryrun);
      return done(null, msg);
    }

    let fetchStarted = Date.now();
    adapter.fetchData(source, function (err, data) {
      let fetchEnded = Date.now();
      // If we have an error
      if (err) {
        const errDict = {};
        const key = err.message || 'Unknown adapter error';
        errDict[key] = 1;
        const msg = generateResultsMessage(0, source, errDict, fetchStarted, fetchEnded, argv.dryrun);
        return done(null, msg);
      }

      // Verify the data format
      let { isValid, failures: reasons } = utils.verifyDataFormat(data);

      // If the data format is invalid
      if (!isValid) {
        const msg = generateResultsMessage(0, source, reasons, fetchStarted, fetchEnded, argv.dryrun);
        return done(null, msg);
      }

      // Clean up the measurements a bit before validation
      data.measurements = data.measurements.map((m) => {
        // Set defaults on measurement if needed
        m.location = m.location || data.name; // use existing location if it exists
        m.country = m.country || source.country;
        m.city = m.city || source.city; // use city from measurement, otherwise default to source
        m.sourceName = source.name;

        // Set defaults for sourceType (default to government)
        // and mobile (default to false).
        m.sourceType = m.sourceType || 'government';
        m.mobile = (m.mobile === undefined) ? false : m.mobile;

        // Remove extra fields
        var wanted = ['date', 'parameter', 'location', 'value', 'unit', 'city',
                      'attribution', 'averagingPeriod', 'coordinates',
                      'country', 'sourceName', 'sourceType', 'mobile'];
        return pick(m, wanted);
      });

      // Remove any measurements that don't meet our requirements
      let { pruned, failures } = utils.pruneMeasurements(data.measurements);
      data.measurements = pruned;

      // If we have no measurements to insert, we can exit now
      if (data.measurements && data.measurements.length === 0) {
        let msg = generateResultsMessage(data.measurements.length, source, failures, fetchStarted, fetchEnded, argv.dryrun);
        return done(null, msg);
      }

      // We can cut out some of the db related tasks if this is a dry run
      if (!argv.dryrun) {
        var inserts = [];
      }
      data.measurements.forEach((m) => {
        // Save or print depending on the state
        if (argv.dryrun) {
          log.info(JSON.stringify(m));
        } else {
          inserts.push(buildSQLObject(m));
        }
      });
      if (argv.dryrun) {
        let msg = generateResultsMessage(data.measurements.length, source, failures, fetchStarted, fetchEnded, argv.dryrun);
        done(null, msg);
      } else {
        // We're running each insert task individually so we can catch any
        // duplicate errors. Good idea? Who knows!
        let insertRecord = function (record) {
          return function (done) {
            pg('measurements')
              .returning('location')
              .insert(record)
              .then((loc) => {
                done(null, {status: 'new'});
              })
              .catch((e) => {
                // Log out an error if it's not an failed duplicate insert
                if (e.code === '23505') {
                  return done(null, {status: 'duplicate'});
                }

                log.error(e);
                done(e);
              });
          };
        };
        let tasks = inserts.map((i) => {
          return insertRecord(i);
        });
        async.parallelLimit(tasks, process.env.PSQL_POOL_MAX || 10, function (err, results) {
          if (err) {
            return done(err);
          }

          // Get rid of duplicates in results array to get actual insert number
          results = filter(results, (r) => {
            return r.status !== 'duplicate';
          });
          let msg = generateResultsMessage(results.length, source, failures, fetchStarted, fetchEnded, argv.dryrun);

          done(null, msg);
        });
      }
    });
  };
};

/**
 * Generate tasks to run in parallel, only care about the active sources
 */
let tasks = [];
sources.forEach((source) => {
  if (source.active) {
    tasks.push(getAndSaveData(source));
  }
});

/**
 * Saves information about fetches to the database
 */
const saveFetches = function (timeStarted, timeEnded, itemsInserted, err, results) {
  return function (done) {
    pg('fetches')
      .insert({time_started: timeStarted, time_ended: timeEnded, count: itemsInserted, results: JSON.stringify(err || results)})
      .then((id) => {
        // Insert was successful
        log.info('Fetches table successfully updated');
        done(null);
      })
      .catch((e) => {
        // An error on fetches insert
        log.error(e);
        done(null);
      });
  };
};

/**
 * Save sources information, overwritten any previous results
 *
 */
const saveSources = function () {
  return function (done) {
    pg('sources')
      .del()
      .then(() => {
        // Delete was successful
        log.verbose('Sources table successfully deleted.');

        // Grab data from sources
        const inserts = sources.map((s) => {
          return {data: s};
        });
        pg('sources')
          .insert(inserts)
          .then(() => {
            log.info('Sources table successfully updated.');
            done(null);
          })
          .catch((e) => {
            // An error on sources insert
            log.error(e);
            done(null);
          });
      })
      .catch((e) => {
        // An error on sources delete
        log.error(e);
        done(null);
      });
  };
};

/**
 * Run all the data fetch tasks in parallel, simply logs out results
 */
var runTasks = function () {
  log.info('Running all fetch tasks.');
  let timeStarted = new Date();
  let itemsInserted = 0;
  async.parallel(tasks, (err, results) => {
    let timeEnded = new Date();
    if (err) {
      log.error('Error during fetching of data sources.');
    } else {
      if (!argv.dryrun) {
        log.info('All data grabbed and saved.');
      }
      results.forEach(function (r) {
        // Add to inserted count if response has a count, if there was a failure
        // response will not have a count
        if (r.count !== undefined) {
          itemsInserted += r.count;
        }
        log.info('///////');
        log.info(r.message);
        for (let k of Object.keys(r.failures || {})) {
          log.info(`${r.failures[k]} occurrences of ${k}`);
        }
        log.info('///////');
      });
    }

    // Send out the webhook to openaq-api since we're all done
    if (argv.dryrun) {
      log.info('Dryrun completed, have a good day!');
      process.exit(0);
    } else {
      // Run functions post fetches
      const postFetchFunctions = [
        saveFetches(timeStarted, timeEnded, itemsInserted, err, results),
        saveSources()
      ];
      async.parallel(postFetchFunctions, (err, results) => {
        if (err) {
          log.error(err);
        }

        sendUpdatedWebhook((err) => {
          if (err) {
            log.error(err);
          }

          log.info('Webhook posted, have a good day!');
          process.exit(0);
        });
      });
    }
  });
};

// Branch here depending on whether this is a dryrun or not
if (argv.dryrun) {
  log.info('--- Dry run for Testing, nothing is saved to the database. ---');
  runTasks();
} else {
  // Set up DB and add in postgis features
  pg = knex(knexConfig);
  st = require('knex-postgis')(pg);
  log.info('Connected to database.');

  // Run any needed migrations and away we go
  pg.migrate.latest(knexConfig)
  .then(() => {
    log.info('Database migrations are handled, ready to roll!');
    runTasks();
  })
  .catch((e) => {
    log.error(e);
  });
}
