/* global describe, it */
/* eslint no-unused-expressions: 0 */
'use strict';

process.env.LOG_LEVEL = 'important'; // mute non-important log messages in tests

const expect = require('chai').expect;
const {getMeasurementsFromSource} = require('../../lib/measurement');

describe('Testing adapter operation', function () {
  describe('pruneMeasurements', function () {
    it('should handle measurements properly', async function () {
      var source = {
        name: 'test',
        adapter: 'dummy',
        data: [
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
              utc: new Date().toISOString(),
              local: '2016-01-24T19:00:00+00:00'
            }
          },
          {
            parameter: 'pm25', // sourceType not valid
            unit: 'µg/m3',
            value: 20,
            sourceType: 'foo',
            date: {
              utc: new Date().toISOString(),
              local: '2016-01-24T19:00:00+00:00'
            }
          },
          {
            parameter: 'pm25', // Good
            unit: 'ppm',
            value: 10,
            date: {
              utc: new Date().toISOString(),
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

      const expectedFailures = {
        'instance requires property "location"': 7,
        'instance requires property "country"': 7,
        'instance requires property "city"': 7,
        'instance requires property "sourceName"': 7,
        'instance requires property "sourceType"': 6,
        'instance requires property "mobile"': 6,
        'instance.parameter is not of a type(s) string': 1,
        'instance.parameter is not one of enum values: pm25,pm10,no2,so2,o3,co,bc': 1,
        'instance.unit is not of a type(s) string': 1,
        'instance.unit is not one of enum values: µg/m³,ppm': 6,
        'instance.value is not of a type(s) number': 1,
        'instance.date is not of a type(s) object': 5,
        'instance.date requires property "utc"': 5,
        'instance.date requires property "local"': 5,
        'instance.coordinates requires property "longitude"': 1,
        'instance.mobile is not of a type(s) boolean': 1,
        'instance.sourceType is not one of enum values: government,research,other': 1
      };

      const measurements = await getMeasurementsFromSource(source, {});
      const pruned = await measurements.stream.toArray();
      const actualFailures = measurements.failures;

      expect(actualFailures).to.deep.equal(expectedFailures);
      expect(pruned.length).to.equal(1);
    });
  });
});
