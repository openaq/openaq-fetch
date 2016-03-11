/**
 * Migration to fix local dates in Netherland's records.
 */
'use strict';

require('babel-register');
let moment = require('moment-timezone');

const realTimezone = 'Europe/Amsterdam';
let getRecords = function (knex) {
  return knex('measurements')
    .where('country', 'NL');
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
