/* global describe, it */
/* eslint no-unused-expressions: 0 */
'use strict';

const expect = require('chai').expect;
const {validateMeasurements, handleMeasurementErrors} = require('../../lib/measurement');
const {DataStream} = require('scramjet');

describe('Testing measurements helper functions', function () {
  describe('pruneMeasurements', function () {
    it('should handle measurements properly', async function (done) {
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
            parameter: 'pm25', // Bad unit
            unit: 'µg/m3',
            value: 20,
            date: new Date()
          },
          {
            parameter: 'pm25', // Date too far in past
            unit: 'µg/m3',
            value: 20,
            date: new Date(new Date().setDate(new Date().getDate() - 5))
          },
          {
            parameter: 'pm25', // mobile not boolean
            unit: 'µg/m3',
            value: 20,
            mobile: 'foo',
            date: {
              utc: new Date(),
              local: '2016-01-24T19:00:00+00:00'
            }
          },
          {
            parameter: 'pm25', // sourceType not valid
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

      const failures = {};
      const pruned = await (
        DataStream.from(data.measurements)
          .use(validateMeasurements)
          .use(handleMeasurementErrors, failures)
          .toArray()
      );

      expect(pruned.length).to.equal(1);
      expect(Object.keys(failures).length).to.equal(17);
      done();
    });
  });
});
