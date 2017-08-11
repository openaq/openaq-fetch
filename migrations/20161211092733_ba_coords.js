/**
 * Migration to update Bosnian coordinates.
 * https://github.com/openaq/openaq-fetch/issues/190
 */

require('babel-register');

// Coordinates from BA source
const getCoordinates = function (location, useNew) {
  if (useNew) {
    switch (location) {
      case 'Bjelave':
        return {
          latitude: 43.866,
          longitude: 18.423
        };
      case 'Vijećnica':
        return {
          latitude: 43.859,
          longitude: 18.435
        };
      case 'mobilna (Ilidža)':
        return {
          latitude: 43.830,
          longitude: 18.311
        };
      case 'Ivan Sedlo':
        return {
          latitude: 43.715,
          longitude: 18.036
        };
      case 'Harmani':
        return {
          latitude: 44.343,
          longitude: 17.268
        };
      case 'Centar':
        return {
          latitude: 44.199,
          longitude: 17.913
        };
      case 'Radakovo':
        return {
          latitude: 44.195,
          longitude: 17.932
        };
      case 'Tetovo':
        return {
          latitude: 44.290,
          longitude: 17.895
        };
      case 'Brist':
        return {
          latitude: 44.202,
          longitude: 17.800
        };
      case 'Otoka':
        return {
          latitude: 43.848,
          longitude: 18.364
        };
      case 'Rasadnik':
        return {
          latitude: 43.661,
          longitude: 18.977
        };
    }
  } else {
    switch (location) {
      case 'Bjelave':
        return {
          latitude: 43.917,
          longitude: 18.8
        };
      case 'Vijećnica':
        return {
          latitude: 44.73,
          longitude: 19.166
        };
      case 'mobilna (Ilidža)':
        return {
          latitude: 44.483,
          longitude: 19.116
        };
      case 'Ivan Sedlo':
        return {
          latitude: 43.816,
          longitude: 18.2
        };
      case 'Harmani':
        return {
          latitude: 44.916,
          longitude: 17.349
        };
      case 'Centar':
        return {
          latitude: 45.13,
          longitude: 18.7
        };
      case 'Radakovo':
        return {
          latitude: 44.9,
          longitude: 18.83
        };
      case 'Tetovo':
        return {
          latitude: 44.75,
          longitude: 18.349
        };
      case 'Brist':
        return {
          latitude: 44.3,
          longitude: 17.93
        };
    }
  }
};

exports.up = function (knex, Promise) {
  const getMeasurements = function () {
    return knex('measurements')
      .select('coordinates', 'data', 'location', '_id')
      .where('country', 'BA');
  };

  const updateMeasurement = function (m) {
    const coords = getCoordinates(m.location, true);
    if (coords) {
      m.data.coordinates = coords;
      knex('measurements')
        .where({
          '_id': m._id
        })
        .update({
          'coordinates': knex.raw(`ST_GeomFromText('Point(${coords.longitude} ${coords.latitude})', 4326)`),
          'data': m.data
        })
        .return();
    }
  };

  return Promise.all([
    getMeasurements()
      .map(updateMeasurement)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.down = function (knex, Promise) {
  const rollbackCoordinates = function (m) {
    // Some locations didn't have measurements, so delete that data if
    // not present, revert if present
    const coords = getCoordinates(m.location, false);
    if (coords) {
      m.data.coordinates = coords;
      knex('measurements')
        .where({
          '_id': m._id
        })
        .update({
          'coordinates': knex.raw(`ST_GeomFromText('Point(${coords.longitude} ${coords.latitude})', 4326)`),
          'data': m.data
        })
        .return();
    } else {
      delete m.data.coordinates;
      knex('measurements')
        .where({
          '_id': m._id
        })
        .update({
          'coordinates': null,
          'data': m.data
        })
        .return();
    }
  };

  const getMeasurements = function () {
    return knex('measurements')
      .select('coordinates', 'data', 'location', '_id')
      .where('country', 'BA');
  };

  return Promise.all([
    getMeasurements()
      .map(rollbackCoordinates)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.config = {
  transaction: false
};
