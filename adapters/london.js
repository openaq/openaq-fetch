'use strict';

var request = require('request');
var _ = require('lodash');
var moment = require('moment-timezone');

exports.name = 'london';

exports.fetchData = function (source, cb) {
  var finalURL = source.url + '?apitoken=' + process.env.INDIA_KIMONO_TOKEN;
  request(finalURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      console.error(err || res);
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

var formatData = function (data) {
  // Wrap the JSON.parse() in a try/catch in case it fails
  try {
    data = JSON.parse(data);
  } catch (e) {
    // Return undefined to be caught elsewhere
    return undefined;
  }

  var getValue = function (measuredValue) {
    var idx = measuredValue.indexOf('(');
    return measuredValue.substring(0, idx);
  };

  var getDate = function (dateString) {
    var date;
    var s = dateString.replace('\n', ' ');
    // Do some magic to turn 24:00 into the next day 00:00
    if (s.match(/24:00:$/) !== null) {
      s = s.replace(/24:00:$/, '00:00:00');
      date = moment.tz(s, 'DD/MM/YYYY HH:mm:ss', 'Europe/London');
      date.add(1, 'day');
    } else {
      date = moment.tz(s, 'DD/MM/YYYY HH:mm:ss', 'Europe/London');
    }

    return {utc: date.toDate(), local: date.format()};
  };

  var addCoordinates = function (obj) {
    switch (obj.name) {
      case 'Camden Kerbside':
        obj.coordinates = {
          latitude: 51.544210,
          longitude: -0.175269
        };
        break;

      case 'Ealing Horn Lane':
        obj.coordinates = {
          latitude: 51.518950,
          longitude: -0.265617
        };
        break;

      case 'Haringey Roadside':
        obj.coordinates = {
          latitude: 51.599300,
          longitude: -0.068218
        };
        break;

      case 'London Bexley':
        obj.coordinates = {
          latitude: 51.466030,
          longitude: 0.184806
        };
        break;

      case 'London Bloomsbury':
        obj.coordinates = {
          latitude: 51.522290,
          longitude: -0.125889
        };
        break;

      case 'London Eltham':
        obj.coordinates = {
          latitude: 51.452580,
          longitude: 0.070766
        };
        break;

      case 'London Haringey Priory Park South':
        obj.coordinates = {
          latitude: 51.584128,
          longitude: -0.125254
        };
        break;

      case 'London Harlington':
        obj.coordinates = {
          latitude: 51.488790,
          longitude: -0.441614
        };
        break;

      case 'London Harrow Stanmore':
        obj.coordinates = {
          latitude: 51.617333,
          longitude: -0.298777
        };
        break;

      case 'London Hillingdon':
        obj.coordinates = {
          latitude: 51.496330,
          longitude: -0.460861
        };
        break;

      case 'London Marylebone Road':
        obj.coordinates = {
          latitude: 51.522530,
          longitude: -0.154611
        };
        break;

      case 'London N. Kensington':
        obj.coordinates = {
          latitude: 51.521050,
          longitude: -0.213492
        };
        break;

      case 'London Teddington':
        obj.coordinates = {
          latitude: 51.420990,
          longitude: -0.339647
        };
        break;

      case 'London Teddington Bushy Park':
        obj.coordinates = {
          latitude: 51.425286,
          longitude: -0.345606
        };
        break;

      case 'London Westminster':
        obj.coordinates = {
          latitude: 51.494670,
          longitude: -0.131931
        };
        break;

      case 'Southwark A2 Old Kent Road':
        obj.coordinates = {
          latitude: 51.480499,
          longitude: -0.059550
        };
        break;

      case 'Tower Hamlets Roadside':
        obj.coordinates = {
          latitude: 51.522530,
          longitude: -0.042155
        };
        break;
    }
  };

  // Handle the fact that there are several locations in one response
  var locations = [];
  _.forEach(data.results.collection1, function (location) {
    var l = {
      name: location.Location.text,
      measurements: []
    };
    var base = {
      name: location.Location.text,
      date: location.datetimeupdated
    };
    // Add coordinates to base if they're available
    addCoordinates(base);

    // PM25
    var obj = _.clone(base);
    obj.parameter = 'pm25';
    obj.measuredValue = location['24hrmeanPM2.5ugm3'];
    l.measurements.push(obj);

    // PM10
    obj = _.clone(base);
    obj.parameter = 'pm10';
    obj.measuredValue = location.running24hrPM10ugm3;
    l.measurements.push(obj);

    // Ozone
    obj = _.clone(base);
    obj.parameter = 'o3';
    obj.measuredValue = location.oone8hourmeanugm3;
    l.measurements.push(obj);

    // NO2
    obj = _.clone(base);
    obj.parameter = 'no2';
    obj.measuredValue = location.no2hourlymeanugm3;
    l.measurements.push(obj);

    // Filter out measurements with no value
    var filtered = _.filter(l.measurements, function (m) {
      var value = getValue(m.measuredValue);
      return isNaN(value) === false && getValue(m.measuredValue) !== '';
    });

    // Build up pretty measurements array
    var measurements = _.map(filtered, function (m) {
      var value = getValue(m.measuredValue);

      var date = getDate(m.date);
      var obj = {
        location: m.name,
        parameter: m.parameter,
        date: date,
        value: Number(value),
        unit: 'µg/m³'
      };
      if (m.coordinates) {
        obj.coordinates = m.coordinates;
      }

      return obj;
    });
    l.measurements = measurements;

    // Add to locations
    locations.push(l);
  });

  // Remove any locations without a measurement
  locations = _.filter(locations, function (l) {
    return l.measurements.length > 0;
  });

  // Flatten to one locations array
  var measurements = [];
  _.forEach(locations, function (l) {
    measurements.push(l.measurements);
  });
  measurements = _.flatten(measurements);

  return {
    name: 'unused',
    measurements: measurements
  };
};
