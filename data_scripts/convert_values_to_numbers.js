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
  measurementsCollection.find({value: {$type: 2}}).toArray(function (e, ms) {
    ms.forEach(function (m) {
      var number = Number(m.value);
      bulk.find({_id: m._id}).updateOne({$set: {value: number}});
    });
    bulk.execute(function (err, result) {
      if (err) {
        console.error(err);
        return db.close();
      }

      console.info('Measurements updated:', result.nModified);
      return db.close();
    });
  });
});
