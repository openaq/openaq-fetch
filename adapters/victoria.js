'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import parallelLimit from 'async/parallelLimit';
import { removeUnwantedParameters, convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'victoria';

export function fetchData (source, cb) {
  request({
    url: source.url,
    headers: {
      'X-API-Key': ${process.env.EPA_VIC_TOKEN}
    }
  }, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      formatData(body, function (data) {
        // Make sure the data is valid
        if (data === undefined) {
          return cb({message: 'Failure to parse data.'});
        }
        cb(null, data);
      });
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
}

var parameters = {
  'PM2.5': 'pm25',
  'PM10': 'pm10',
  'NO2': 'no2',
  'SO2': 'so2',
  'O3': 'o3',
  'CO': 'co',
  'BC': 'bc'
};

var units = {
  '&micro;g/m&sup3;': 'µg/m³',
  'ppm': 'ppm'
};

var formatData = function (data, formatDataCB) {
  var sites = JSON.parse(data).records;

  // request measurements from each site
  var tasks = sites.map(function (site) {
    return function (cb) {
      request({
        url: `https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1/sites/${site.siteID}/parameters`,
        headers: {
          'X-API-Key': ${process.env.EPA_VIC_TOKEN}
        }
      }, function (err, res, body) {
        var source = JSON.parse(body);

        // base properties shared for all measurements at this site
        var baseProperties = {
          location: source.siteName,
          country: 'AU',
          city: 'Victoria',
          attribution: [
            {
              name: '',
              url: ''
            }
          ],
          coordinates: {
            latitude: source.geometry.coordinates[0],
            longitude: source.geometry.coordinates[1]
          },
          sourceType: 'government'
        };

        // list of all measurements at this site
        var measurements = source.parameters.map(function (parameter) {
          if (parameter.name in parameters) {
            var measurement = baseProperties;
            measurement.parameter = parameters[parameter.name];

            // from the range of time series readings, find the 1HR_AV one
            var 1hrAverageReadings = parameter.timeSeriesReadings.filter(function(timeSeriesReading) {
              return timeseriesReading.timeSersieName === "1HR_AV";
            });

            if (1hrAverageReadings.length && 1hrAverageReadings[0].length) {
              var reading = 1hrAverageReadings[0][0];
              if (reading.unit in units) {
                measurement.unit = units[reading.unit];
                measurement.averagingPeriod = { value: 1, unit: 'hours' };
                measurement.value = Number(reading.averageValue);

                var date = moment.tz(reading.since, 'Australia/Melbourne');

                measurement.date = {
                  utc: date.toDate(),
                  local: date.format()
                };

                return measurement;
              }
            }
          }
        }).filter(function (measurement) {
          return measurement !== null;
        });

        cb(err, measurements);
      })
    };
  });

  parallelLimit(tasks, 1, function (err, measurements) {
    formatDataCB({name: 'unused', measurements: _.flatten(measurements)});
  });
};
