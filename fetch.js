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
  .boolean('noemail')
  .describe('noemail', 'Run the fetch process but do not send emails if there are errors.')
  .help('h')
  .alias('h', 'help')
  .argv;

var async = require('async');
var _ = require('lodash');
var MongoClient = require('mongodb').MongoClient;
var mailer = require('./lib/mailer');
var utils = require('./lib/utils');

var adapters = require('./adapters');
var sources = require('./sources');

var dbURL = process.env.MONGOLAB_URI || 'mongodb://localhost:27017/openAQ';
var measurementsCollection;

// Flatten the sources into a single array, taking into account sources argument
sources = _.chain(sources).values().flatten().value();
if (argv.source) {
  sources = _.find(sources, { name: argv.source });

  // Check here to make sure we have at least one valid source
  if (!sources) {
    console.error('I\'m sorry Dave, I searched all known sources and can\'t ' +
      'find anything for', argv.source);
    process.exit(1);
  }

  // Make it a single element array to play nicely downstream
  sources = [sources];
}

var findAdapter = function (name) {
  return _.find(adapters, function (a) {
    return a.name === name;
  });
};

var getAndSaveData = function (source) {
  return function (done) {
    // Get the appropriate adapter
    var adapter = findAdapter(source.adapter);
    if (!adapter) {
      var err = {message: 'Could not find adapter.', source: source.name};
      return done(null, err);
    }

    adapter.fetchData(source, function (err, data) {
      // If we have an error, send an email to the contacts and stop
      if (err) {
        // Don't send an email if it's a dry run or noemail flag is set
        if (!argv.dryrun && !argv.noemail) {
          mailer.sendFailureEmail(source.contacts, source.name, err);
        }
        err.source = source.name;
        return done(null, err);
      }

      // Verify the data format
      var isValid = utils.verifyDataFormat(data);

      // If the data format is invalid, let the contacts know
      if (!isValid) {
        var error = {message: 'Adapter returned invalid results.', source: source.name};
        // Don't send an email if it's a dry run or noemail flag is set
        if (!argv.dryrun && !argv.noemail) {
          mailer.sendFailureEmail(source.contacts, source.name, error);
        }
        return done(null, error);
      }

      // Remove any measurements that don't meet our requirements
      data.measurements = utils.pruneMeasurements(data.measurements);

      // If we have no measurements to insert, we can exit now
      if (data.measurements && data.measurements.length === 0) {
        var msg = {
          message: 'New measurements inserted for ' + source.name + ': 0',
          source: source.name
        };
        // A little hacky to signify a dry run
        if (argv.dryrun) {
          msg.message = '[Dry run] ' + msg.message;
        }
        return done(null, msg);
      }

      // We can cut out some of the db related tasks if this is a dry run
      if (!argv.dryrun) {
        var bulk = measurementsCollection.initializeUnorderedBulkOp();
      }
      _.forEach(data.measurements, function (m) {
        // Set defaults on measurement if needed
        m.location = m.location || data.name; // use existing location if it exists
        m.country = m.country || source.country;
        m.city = m.city || source.city; // use city from measurement, otherwise default to source
        m.sourceName = source.name;

        // Remove extra fields
        var wanted = ['date', 'parameter', 'location', 'value', 'unit', 'city',
                      'attribution', 'averagingPeriod', 'coordinates',
                      'country', 'sourceName'];
        m = _.pick(m, wanted);

        // Save or print depending on the state
        if (argv.dryrun) {
          console.info(m);
        } else {
          bulk.insert(m);
        }
      });
      if (argv.dryrun) {
        msg = {
          message: '[Dry run] New measurements inserted for ' + source.name + ': ' + data.measurements.length,
          source: source.name
        };
        done(null, msg);
      } else {
        bulk.execute(function (err, result) {
          if (err) {
            // No need to log this out for now
          }
          var msg = {
            message: 'New measurements inserted for ' + source.name + ': ' + result.nInserted,
            source: source.name
          };
          done(null, msg);
        });
      }
    });
  };
};

var tasks = _.map(sources, function (source) {
  return getAndSaveData(source);
});

var runTasks = function (db) {
  async.parallel(tasks, function (err, results) {
    if (err) {
      console.error(err);
    } else {
      if (!argv.dryrun) {
        console.info('All data grabbed and saved.');
      }
      console.info(results);
    }

    // Close the database if it exists
    if (db) {
      db.close();
    }

    return console.info('Have a good day!');
  });
};

// Branch here depending on whether this is a dryrun or not
if (argv.dryrun) {
  console.info('--- Dry run for Testing, nothing is saved to the database. ---');
  runTasks();
} else {
  MongoClient.connect(dbURL, function (err, db) {
    if (err) {
      return console.error(err);
    }
    console.info('Connected to database.');

    // Get collection and ensure indexes
    measurementsCollection = db.collection('measurements');
    async.parallel([
      function (done) {
        measurementsCollection.createIndex({ location: 1, parameter: 1, 'date.utc': 1 }, { unique: true }, function (err) {
          done(err);
        });
      },
      function (done) {
        measurementsCollection.createIndex({ city: 1 }, { background: true }, function (err) {
          done(err);
        });
      },
      function (done) {
        measurementsCollection.createIndex({ 'date.utc': 1 }, { background: true }, function (err) {
          done(err);
        });
      },
      function (done) {
        measurementsCollection.createIndex({ 'country': 1, 'date.utc': -1 }, { background: true }, function (err) {
          done(err);
        });
      },
      function (done) {
        measurementsCollection.createIndex({ 'country': 1 }, { background: true }, function (err) {
          done(err);
        });
      },
      function (done) {
        measurementsCollection.createIndex({ 'location': 1, 'date.utc': -1 }, { background: true }, function (err) {
          done(err);
        });
      }
    ], function (err, results) {
      if (err) {
        db.close();
        return console.error(err);
      }
      console.info('Indexes created and database ready to go.');
      runTasks(db);
    });
  });
}
