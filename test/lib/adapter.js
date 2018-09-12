/* global describe, it */
/* eslint no-unused-expressions: 0 */
'use strict';

process.env.LOG_LEVEL = 'important'; // mute non-important log messages in tests

const expect = require('chai').expect;
const {getCorrectedMeasurementsFromSource} = require('../../lib/measurement');

describe('Testing adapter operation', function () {
  describe('pruneMeasurements', function () {
    const correctableMeasurement = {
      parameter: 'PM25', // should be lowercased
      unit: 'PpHM', // should be converted
      value: '10', // should be casted to number
      date: new Date(), // should be converted to object
      location: 'test',
      coordinates: {
        latitude: -20,
        longitude: 34
      },
      averagingPeriod: {
        value: 1,
        unit: 'hours'
      }
      // remaining items should be taken from source data
    };

    const idealMeasurement = {
      parameter: 'pm25', // Ideal
      unit: 'ppm',
      value: 10,
      date: {
        utc: new Date().toISOString(),
        local: '2016-01-24T19:00:00+00:00'
      },
      location: 'test',
      coordinates: {
        latitude: -20,
        longitude: 34
      },
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
    };

    const errorData = [
      {
        parameter: 324, // err: Bad param, unit, value
        unit: 234,
        value: 'asd',
        date: new Date()
      },
      {
        parameter: 'pm25', // err: Bad unit
        unit: 'ppq',
        value: 234,
        date: new Date()
      },
      {
        parameter: 'pm25', // err: Bad coords
        unit: 'ppm',
        value: 234,
        coordinates: {
          latitude: 43
        },
        date: new Date()
      },
      {
        parameter: 'pm25', // err: Bad unit
        unit: 'µg/m3',
        value: 20,
        date: new Date()
      },
      {
        parameter: 'pm25', // err: Date too far in past
        unit: 'µg/m3',
        value: 20,
        date: new Date(new Date().setDate(new Date().getDate() - 5))
      },
      {
        parameter: 'pm25', // err: mobile not boolean
        unit: 'µg/m3',
        value: 20,
        mobile: 'foo',
        date: {
          utc: +new Date(),
          local: '2016-01-24T19:00:00+00:00'
        }
      },
      {
        parameter: 'pm25', // err: sourceType not valid
        unit: 'µg/m3',
        value: 20,
        sourceType: 'foo',
        date: {
          utc: new Date(),
          local: '2016-01-24T19:00:00+00:00'
        }
      }
    ];

    it('should correct measurements with good source', async function () {
      var source = {
        name: 'test',
        adapter: 'dummy',
        country: 'VU',
        city: 'Test',
        description: 'Test adapter with test source',
        sourceURL: 'http://example.org/',
        type: 'research',
        mobile: false,
        url: 'http://example.org/data-url/',
        contacts: ['info@openaq.org'],
        attribution: [{ name: 'test', url: 'http://foo.com' }],
        data: [idealMeasurement, correctableMeasurement]
      };

      const measurements = await getCorrectedMeasurementsFromSource(source, {});
      const pruned = await measurements.stream.toArray();
      const actualFailures = measurements.failures;

      expect(actualFailures).to.deep.equal({});
      expect(pruned.length).to.equal(2);
    });

    it('should handle measurements properly', async function () {
      var source = {
        adapter: 'dummy',
        data: errorData.concat(idealMeasurement)
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
        'instance.unit is not one of enum values: µg/m³,ppm': 2,
        'instance.value is not of a type(s) number': 1,
        'instance.coordinates requires property "longitude"': 1,
        'instance.mobile is not of a type(s) boolean': 1,
        'instance.sourceType is not one of enum values: government,research,other': 1
      };

      const measurements = await getCorrectedMeasurementsFromSource(source, {});
      const pruned = await measurements.stream.toArray();
      const actualFailures = measurements.failures;

      expect(actualFailures).to.deep.equal(expectedFailures);
      expect(Object.keys(actualFailures).length).to.be.equals(14);
      expect(pruned.length).to.equal(1);
    });
  });
});
