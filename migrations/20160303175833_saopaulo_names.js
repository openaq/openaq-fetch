require('babel-register');

exports.up = function(knex, Promise) {
  var saopaulo = require('../adapters/saopaulo.js');
  var getLocations = function() {
    return knex.select('location', 'city')
      .distinct('location')
      .orderBy('location', 'city')
      .from('measurements')
      .where({
        'country': 'BR',
        'city': 'Sao Paulo'
      });
  };

  var updateLocation = function(lr) {
    console.log('Updating ' + lr.location + ', ' + lr.city);
    knex('measurements')
      .where({
        'country': 'BR',
        'city': 'Sao Paulo',
        'location': lr.location
      })
      .update('city', saopaulo.stationsCities[lr.location] || lr.location)
      .return()
  };

  return Promise.all([
    getLocations()
      .then((locations) => {
        locations.map(updateLocation);
      })
      .catch((err) => {
        console.log(err);
      })
  ])
};

exports.down = function(knex, Promise) {
  
};
exports.config = {
  transaction: false
};
