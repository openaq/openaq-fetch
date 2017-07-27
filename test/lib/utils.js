/* global describe, it */
'use strict';

var expect = require('chai').expect;
var utils = require('../../lib/utils');

describe('Testing helper functions', function () {
  describe('verifyDataFormat', function () {
    it('should fail with nothing', function (done) {
      expect(utils.verifyDataFormat().isValid).to.be.false;
      expect(utils.verifyDataFormat({}).isValid).to.be.false;
      done();
    });

    it('should fail with bad name', function (done) {
      var data = {
        name: 234
      };
      expect(utils.verifyDataFormat(data).isValid).to.be.false;
      done();
    });

    it('should fail with bad name', function (done) {
      var data = {
        name: 123,
        measurements: []
      };
      expect(utils.verifyDataFormat(data.measurements).isValid).to.be.false;
      done();
    });

    it('should fail with bad measurements', function (done) {
      var data = {
        name: 'test',
        measurements: {}
      };
      expect(utils.verifyDataFormat(data.measurements).isValid).to.be.false;
      done();
    });

    it('should pass with good data', function (done) {
      var data = {
        name: 'test',
        measurements: [
          {
            parameter: 'test',
            unit: 'test',
            value: 34,
            date: new Date()
          },
          {
            parameter: 'test',
            unit: 'test',
            value: 34,
            date: new Date()
          }
        ]
      };
      expect(utils.verifyDataFormat(data).isValid).to.be.true;
      done();
    });
  });

  describe('pruneMeasurements', function () {
    it('should handle measurements properly', function (done) {
      var data = {
        name: 'test',
        measurements: [
          {
            parameter: 324, // Bad param, unit, value
            unit: 234,
            value: 'asd',
            date: new Date()
          },
          {
            parameter: 'pm25', // Bad unit
            unit: 'ppb',
            value: 234,
            date: new Date()
          },
          {
            parameter: 'pm25', // Bad coords
            unit: 'ppm',
            value: 234,
            coordinates: {
              latitude: 43
            },
            date: new Date()
          },
          {
            parameter: 'pm25',  // Bad unit
            unit: 'µg/m3',
            value: 20,
            date: new Date()
          },
          {
            parameter: 'pm25',  // Date too far in past
            unit: 'µg/m3',
            value: 20,
            date: new Date(new Date().setDate(new Date().getDate() - 5))
          },
          {
            parameter: 'pm25',  // mobile not boolean
            unit: 'µg/m3',
            value: 20,
            mobile: 'foo',
            date: {
              utc: new Date(),
              local: '2016-01-24T19:00:00+00:00'
            }
          },
          {
            parameter: 'pm25',  // sourceType not valid
            unit: 'µg/m3',
            value: 20,
            sourceType: 'foo',
            date: {
              utc: new Date(),
              local: '2016-01-24T19:00:00+00:00'
            }
          },
          {
            parameter: 'pm25', // Good
            unit: 'ppm',
            value: 10,
            date: {
              utc: new Date(),
              local: '2016-01-24T19:00:00+00:00'
            },
            location: 'test',
            country: 'US',
            city: 'Test',
            sourceName: 'Test',
            mobile: false,
            sourceType: 'government',
            attribution: [{
              name: 'test',
              url: 'http://foo.com'
            }],
            averagingPeriod: {
              value: 1,
              unit: 'hours'
            }
          }
        ]
      };
      let { pruned, failures } = utils.pruneMeasurements(data.measurements);
      expect(pruned.length).to.equal(1);
      expect(Object.keys(failures).length).to.equal(17);
      done();
    });
  });

  describe('removeUnwantedParameters', function () {
    it('should remove unwanted measurements', function (done) {
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
      done();
    });
  });

  describe('convertUnits', function () {
    it('should convert units', function (done) {
      let measurements = [
        {
          parameter: 'pm10', // Good
          unit: 'pphm',
          value: 'asd',
          date: new Date()
        },
        undefined
      ];
      expect(utils.convertUnits(measurements).length).to.equal(2);
      expect(utils.convertUnits(measurements)[0].unit).to.equal('ppm');
      done();
    });
  });
});
