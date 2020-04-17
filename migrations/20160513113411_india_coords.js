/**
 * Migration to add missing India coordinates.
 * https://github.com/openaq/openaq-api/issues/251
 */

require('babel-register');

// the coordinates are from CPCB data
const indiaCoordinates = {
  'Punjabi Bagh': {
    latitude: 28.6683,
    longitude: 77.1167
  },
  'Mandir Marg': {
    latitude: 28.6341,
    longitude: 77.2005
  },
  'RK Puram': {
    latitude: 28.5648,
    longitude: 77.1744
  },
  'Anand Vihar': {
    latitude: 28.6508,
    longitude: 77.3152
  }
};

exports.up = function (knex, Promise) {
  const getMeasurements = function () {
    return knex('measurements')
      .select('coordinates', 'data', 'location', '_id')
      .whereNull('coordinates')
      .andWhere('country', 'IN')
      .andWhere('city', 'Delhi')
      .andWhereNot('source_name', 'CPCB')
      .andWhere('location', 'Punjabi Bagh')
      .orWhere('location', 'Mandir Marg')
      .orWhere('location', 'RK Puram')
      .orWhere('location', 'Anand Vihar');
  };

  const updateMeasurement = function (m) {
    const coords = indiaCoordinates[m.location];
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
  };

  const getMeasurements = function () {
    return knex('measurements')
      .select('coordinates', 'data', 'location', '_id')
      .where('country', 'IN')
      .andWhere('city', 'Delhi')
      .andWhereNot('source_name', 'CPCB')
      .andWhere('location', 'Punjabi Bagh')
      .orWhere('location', 'Mandir Marg')
      .orWhere('location', 'RK Puram')
      .orWhere('location', 'Anand Vihar');
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
