/**
 * Migration to fix NSW, Australia data field
 * https://github.com/openaq/openaq-api/issues/326
 */

import { default as moment } from 'moment-timezone';

const country = 'AU';

exports.up = function (knex, Promise) {
  var getLocations = function () {
    return knex('measurements')
      .whereRaw('date_utc < ?', ['2016-04-15'])
      .andWhere({
        'country': country
      });
  };

  var updateLocation = function (row) {
    var localDate = moment.tz(row.date_utc, 'Australia/Melbourne');
    row.data = Object.assign(
      row.data,
      { date: {
        utc: row.date_utc,
        local: localDate.format()
      },
        country: row.country,
        city: row.city,
        location: row.location,
        value: row.value,
        unit: row.unit,
        parameter: row.parameter
      });
    knex('measurements')
      .where({
        '_id': row._id
      })
      .update({
        'data': row.data
      })
      .return();
  };

  return Promise.all([
    getLocations()
      .map(updateLocation)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.down = function (knex, Promise) {
  return Promise.all([]);
};
