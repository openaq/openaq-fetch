/**
 * Migration to fix local dates in Mongolia's records
 *
 * moment-timezone must be updated
 * to have IANA 2017b version.
 *
 */
'use strict';

require('babel-register');
let moment = require('moment-timezone');

const realTimezone = 'Asia/Ulaanbaatar';
let getRecords = function (knex) {
  return knex('measurements')
    .whereBetween('date_utc', ['2017-03-24', '2017-07-15'])
    .andWhere('country', 'MN');
};

exports.up = function (knex, Promise) {
  var updateRecord = function (row) {
    const localDate = moment(row.data.date.local).tz(realTimezone);
    row.data.date.local = localDate.format();
    knex('measurements')
      .where('_id', row._id)
      .update('data', row.data)
      .return();
  };

  return Promise.all([
    getRecords(knex)
      .map(updateRecord)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.down = function (knex, Promise) {
  var rollbackRecord = function (row) {
    const utcDate = moment(row.data.date.local).tz('UTC');
    row.data.date.local = utcDate.format();
    knex('measurements')
      .where('_id', row._id)
      .update('data', row.data)
      .return();
  };

  return Promise.all([
    getRecords(knex)
      .map(rollbackRecord)
      .catch((err) => {
        console.error(err);
      })
  ]);
};

exports.config = {
  transaction: false
};
