'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');
var async = require('async');

exports.name = 'chile';

exports.fetchData = function (source, cb) {
  // Fetch both the measurements and meta-data about the locations
  var sources = [source.url, 'http://sinca.mma.gob.cl/index.php/json/listado'];
  var tasks = [];

  _.forEach(sources, function (e) {
    var task = function (cb) {
      request(e, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        cb(null, body);
      });
    };

    tasks.push(task);
  });

  async.parallel(tasks, function (err, results) {
    if (err) {
      return console.log(err);
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(results);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

var formatData = function (results) {
  try {
    var data = JSON.parse(results[0]);
    var meta = JSON.parse(results[1]);
  } catch (e) {
    return undefined;
  }

  // Measurements are stored in a 'status' object. If there are no measurements
  // 'status' will be an empty array.
  var reportingStations = _.filter(data, function (s) {
    return _.isPlainObject(s.status);
  });

  var paramMap = {
    'PM25': 'pm25',
    'PM10': 'pm10',
    '0001': 'so2', // Dióxido de azufre
    '0003': 'no2', // Dióxido de nitrógeno
    '0004': 'co', // Monóxido de carbono
    '0008': 'o3' // Ozono
  };

  // Fetch the city (comuna) from a separate meta endpoint
  var getComuna = function (id) {
    var s = _.get(_.find(meta, _.matchesProperty('key', id)), 'comuna');
    return s;
  };

  var parseDate = function (m) {
    var date = moment.tz(m.date + m.hour, 'YYYY-MM-DDHH:mm', 'America/Santiago');

    return {utc: date.toDate(), local: date.format()};
  };

  // Make 'µg/m³' pretty
  var parseUnit = function (u) {
    return (u === '&micro;g/m<sup>3</sup>' || u === '&micro;g/Nm<sup>3</sup>') ? 'µg/m³' : u;
  };

  var measurements = [];

  _.forEach(reportingStations, function (s) {
    // Store the main properties for this measuring station
    // Sometimes the listado object doesn't exist, in that case, defaulting to nombre
    var base = {
      city: getComuna(s.key) || s.nombre,
      location: s.nombre,
      coordinates: {
        latitude: s.latitud,
        longitude: s.longitud
      },
      attribution: [
        {name: 'SINCA', url: 'http://sinca.mma.gob.cl/'},
        {name: s.empresa}
      ]
    };

    // Loop over the parameters measured by this station
    _.forOwn(s.status, function (value, key) {
      var m = _.clone(base);
      m.parameter = paramMap[key];
      m.date = parseDate(value);
      m.value = Number(value.uvalue);
      m.unit = parseUnit(value.uunit);
      measurements.push(m);
    });
  });

  return {
    name: 'unused',
    measurements: measurements
  };
};
