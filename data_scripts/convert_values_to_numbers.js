'use strict';
var MongoClient = require('mongodb').MongoClient;

var dbURL = process.env.MONGOLAB_URI || 'mongodb://localhost:27017/openAQ';
var measurementsCollection;

MongoClient.connect(dbURL, function (err, db) {
  if (err) {
    return console.error(err);
  }
  console.info('Connected to database.');

  // Get collection and ensure indexes
  measurementsCollection = db.collection('measurements');
  measurementsCollection.find({}).toArray(function (e, ms) {
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (typeof m.value !== 'number') {
        console.info('Saving new value: ', i + 1);
        m.value = Number(m.value);
        measurementsCollection.save(m);
      }
    }
    db.close();
  });
});
