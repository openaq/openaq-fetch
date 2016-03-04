require('babel-register');
var saopaulo = require('../adapters/saopaulo.js');

var Country = 'BR';
var City = 'Sao Paulo'

exports.up = function (knex, Promise) {
  var getLocations = function () {
    return knex('measurements')
      .select(knex.raw('distinct on (location) location, city, data'))
      .orderBy('location')
      .where({
        'country': Country,
        'city': City
      });
  };

  var updateLocation = function (row) {
    row.data.city = saopaulo.stationsCities[row.location] || row.location;
    knex('measurements')
      .where({
        'country': Country,
        'city': City,
        'location': row.location
      })
      .update({
        'city': saopaulo.stationsCities[row.location] || row.location,
        'data': row.data
      })
      .return();
  };

  return Promise.all([
    getLocations()
      .map(updateLocation)
      .catch((err) => {
        console.log(err);
      })
  ]);
};

exports.down = function (knex, Promise) {
  var locations = Object.keys(saopaulo.stationsCities);

  var rollbackCity = function (row) {
    row.data.city = City;

    knex('measurements')
      .where({
        'country': Country,
        'location': row.location
      })
      .update({
        'city': City,
        'data': row.data
      })
      .return();
  }

  var getLocations = function () {
    return knex('measurements')
      .select(knex.raw('distinct on (location) location, data'))
      .orderBy('location')
      .whereIn('location', locations)
      .andWhere('country', Country);
  }

  return Promise.all([
    getLocations()
      .map(rollbackCity)
      .catch((err) => {
        console.log(err);
      })
  ]);
};

exports.config = {
  transaction: false
};
