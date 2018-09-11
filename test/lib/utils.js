/* global describe, it */
/* eslint no-unused-expressions: 0 */
'use strict';

var expect = require('chai').expect;
var utils = require('../../lib/utils');

describe('Testing helper functions', function () {
  describe('removeUnwantedParameters', function () {
    it('should remove unwanted measurements', async function () {
      let measurements = [
        {
          parameter: 'pm10', // Good
          unit: 234,
          value: 'asd',
          date: new Date()
        },
        {
          parameter: 'pm25', // Good
          unit: 'ppb',
          value: 234,
          date: new Date()
        },
        {
          parameter: 'test', // Bad
          unit: 'ppm',
          value: 234,
          coordinates: {
            latitude: 43
          },
          date: new Date()
        }
      ];
      expect(utils.removeUnwantedParameters(measurements).length).to.equal(2);
    });
  });

  describe('convertUnits', function () {
    it('should convert units', async function () {
      let measurements = [
        {
          parameter: 'pm10', // Good
          unit: 'pphm',
          value: 1234,
          date: new Date()
        },
        undefined
      ];

      measurements.forEach(utils.unifyMeasurementUnits);

      expect(measurements.length).to.equal(2);
      expect(measurements[0].unit).to.equal('ppm');
    });
  });
});
