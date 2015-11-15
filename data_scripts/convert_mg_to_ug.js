'use strict';
var MongoClient = require('mongodb').MongoClient;

var dbURL = process.env.MONGOLAB_URI || 'mongodb://localhost:27017/openAQ';

MongoClient.connect(dbURL, function (err, db) {
  if (err) {
    return console.error(err);
  }
  console.info('Connected to database.');

  // Find values that are stored as string and convert to numbers
  var measurementsCollection = db.collection('measurements');
  var bulk = measurementsCollection.initializeUnorderedBulkOp();
  measurementsCollection.find({unit: 'mg/m3'}).toArray(function (e, ms) {
    ms.forEach(function (m) {
      var ug = m.value * 1000;
      bulk.find({_id: m._id}).updateOne({$set: {value: ug, unit: 'µg/m³'}});
    });

    // Check if we have any matches, if not bail out
    if (bulk.s.batches.length === 0) {
      console.info('No matching operations.');
      return db.close();
    }

    // Make it so!
    bulk.execute(function (err, result) {
      if (err) {
        console.error(err);
        return db.close();
      }

      console.info('Measurements matched:', result.nMatched);
      console.info('Measurements inserted:', result.nInserted);
      console.info('Measurements updated:', result.nModified);
      console.info('Measurements upserted:', result.nUpserted);
      console.info('Measurements removed:', result.nRemoved);
      return db.close();
    });
  });
});
