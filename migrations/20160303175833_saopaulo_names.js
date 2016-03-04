require('babel-register');
var saopaulo = require('../adapters/saopaulo.js');

exports.up = function (knex, Promise) {
  var getLocations = function () {
    return knex.select('location', 'city')
      .distinct('location')
      .orderBy('location', 'city')
      .from('measurements')
      .where({
        'country': 'BR',
        'city': 'Sao Paulo'
      });
  };

  var updateLocation = function (lr) {
    console.log('Updating ' + lr.location + ', ' + lr.city);
    knex('measurements')
      .where({
        'country': 'BR',
        'city': 'Sao Paulo',
        'location': lr.location
      })
      .update('city', saopaulo.stationsCities[lr.location] || lr.location)
      .return();
  };

  return Promise.all([
    getLocations()
      .then((locations) => {
        locations.map(updateLocation);
      })
      .catch((err) => {
        console.log(err);
      })
  ]);
};

exports.down = function (knex, Promise) {
  var locations = Object.keys(saopaulo.stationsCities);

  return Promise.all([
    knex('measurements')
    .whereIn('location', locations)
    .andWhere('country', 'BR')
    .update('city', 'Sao Paulo')
  ]);
};

exports.config = {
  transaction: false
};
