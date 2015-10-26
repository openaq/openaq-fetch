'use strict';

var moment = require('moment-timezone');

var MongoClient = require('mongodb').MongoClient;

var dbURL = process.env.MONGOLAB_URI || 'mongodb://localhost:27017/openAQ';

var convertToLocal = function (m) {
  var zone;
  switch (m.sourceName) {
    case 'Sao Paulo':
      zone = 'America/Sao_Paulo';
      break;
    case 'Punjabi Bagh':
    case 'Mandir Marg':
    case 'Anand Vihar':
    case 'RK Puram':
      zone = 'Asia/Kolkata';
      break;
    case 'Greater London':
      zone = 'Europe/London';
      break;
    case 'Beijing US Embassy':
    case 'Guangzhou':
    case 'Shenyang':
    case 'Shanghai':
    case 'Chengdu':
      zone = 'Asia/Shanghai';
      break;
    case 'Poland':
      zone = 'Europe/Warsaw';
      break;
    case 'Agaar.mn':
      zone = 'Asia/Ulaanbaatar';
      break;
    case 'Chile - SINCA':
      zone = 'America/Santiago';
      break;
    case 'Netherlands':
      zone = 'Europe/Amsterdam';
      break;
    case 'Australia - New South Wales':
      zone = 'Australia/Melbourne';
      break;
    default:
      console.log('Unknown sourceName:', m.sourceName);
  }

  if (!zone) {
    return;
  }

  // This will format it into an ISO string
  return moment(m.date).tz(zone).format();
};

MongoClient.connect(dbURL, function (err, db) {
  if (err) {
    return console.error(err);
  }
  console.info('Connected to database.');

  // Get collection and ensure indexes
  var c = db.collection('measurements');
  c.find().toArray(function (err, docs) {
    if (err) {
      return console.error(err);
    }

    console.log('Number of measurements:', docs.length);
    var converted = 0;
    docs.forEach(function (m) {
      // If this has already been converted, don't do anything
      if (!(m.date instanceof Date)) {
        return;
      }

      var utc = m.date;
      var local = convertToLocal(m);

      if (!local) {
        return;
      }

      // Slow but we need to update based on date in the record, so I think
      // it's necessary.
      c.update({ _id: m._id }, { $set: { 'date': { 'utc': utc, 'local': local } } });
      converted++;
    });

    db.close();
    console.log('Number of measurements converted:', converted);
  });
});
