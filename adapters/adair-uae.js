/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the United Arab Emirate data sources.
 *
 * This is a two-stage adapter requiring loading multiple urls before parsing
 * data.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import async from 'async';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'adair-uae';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  // Fetch both the measurements and meta-data about the locations
  var tasks = [];
  _.forEach(stations, function (s) {
    const sourceName = source.url + s.urlName;
    var task = function (cb) {
      request({
        'rejectUnauthorized': false,
        'url': sourceName,
        'method': 'GET'
      }, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        try {
          const data = JSON.parse(JSON.parse(body).JSONDataResult);
          cb(null, Object.assign({
            data
          }, s));
        } catch (e) {
          return cb({message: 'Failure to load data'});
        }
      });
    };
    tasks.push(task);
  });
  async.parallel(tasks, function (err, results) {
    if (err) {
      console.log(err);
      return cb({message: 'Failure to load data urls.'});
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(results);
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {array} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
var formatData = function (results) {
  var paramMap = {
    'PM25': 'pm25',
    'PM10': 'pm10',
    'SO2': 'so2',
    'NO2': 'no2',
    'CO': 'co',
    'O3': 'o3'
  };
  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var parseDate = function (m) {
    m = moment(m).format('YYYY-MM-DDHH:mm');
    var date = moment.tz(m, 'YYYY-MM-DDHH:mm', 'Asia/Dubai');
    return {utc: date.toDate(), local: date.format()};
  };

  var measurements = [];

  _.forEach(results, function (s) {
    var base = {
      city: s.city,
      location: s.location,
      coordinates: s.coordinates,
      attribution: [
        {name: 'Environment Agency - Abu Dabhi', url: 'https://www.adairquality.ae/'}
      ],
      unit: 'µg/m³'
    };
    // Loop over the parameters measured by this station
    for (var i in s.data) {
      const date = parseDate(s.data[i].DateTime);
      for (let [key, value] of Object.entries(s.data[i])) {
        const param = paramMap[key];
        if (typeof param !== 'undefined') {
          var m = _.clone(base);
          m.parameter = param;
          m.date = date;
          m.value = (param === 'co') ? (Number(value) * 1000) : Number(value);
          measurements.push(m);
        }
      }
    }
  });
  return {
    name: 'unused',
    measurements: measurements
  };
};

const stations = [
  {
    urlName: 'AlAinSchool',
    location: 'Al Ain Islamic Institute',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.22937,
      longitude: 55.75031
    }
  },
  {
    urlName: 'AlAinStreet',
    location: 'Al Tayseer Street',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.22625,
      longitude: 55.76567
    }
  },
  {
    urlName: 'AlMaqta',
    location: 'Al Maqtaa',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.40255,
      longitude: 54.51382
    }
  },
  {
    urlName: 'AlQuaa',
    location: 'Al Quaa',
    city: 'Al Quaa',
    coordinates: {
      latitude: 23.53041,
      longitude: 55.48645
    }
  },
  {
    urlName: 'Habshan',
    location: 'Biljian',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 23.75064,
      longitude: 53.74533
    }
  },
  {
    urlName: 'HamdanStreet',
    location: 'Hamdan Street',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.48808,
      longitude: 54.36169
    }
  },
  {
    urlName: 'KhadijaSchool',
    location: 'Khadeeja School',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.48207,
      longitude: 54.36895
    }
  },
  {
    urlName: 'KhalifaCity',
    location: 'Khalifa City A',
    city: 'Khalifa City',
    coordinates: {
      latitude: 24.42005,
      longitude: 54.57817
    }
  },
  {
    urlName: 'KhalifaSchool',
    location: 'Khalifa Bin Zayed Secondary School',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.43007,
      longitude: 54.40690
    }
  },
  {
    urlName: 'Mussafah',
    location: 'Mussafah',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.34689,
      longitude: 54.50265
    }
  },
  {
    urlName: 'AlTawia',
    location: 'Al Tawia',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.25881,
      longitude: 55.70514
    }
  },
  {
    urlName: 'Zakher',
    location: 'Zakher',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.16332,
      longitude: 55.70231
    }
  },
  {
    urlName: 'AlMafraq',
    location: 'Al Mafraq',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.28523,
      longitude: 54.58833
    }
  },
  {
    urlName: 'Sweihan',
    location: 'Sweihan',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.46684,
      longitude: 55.32829
    }
  },
  {
    urlName: 'Baniyas',
    location: 'Baniyas School',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.32142,
      longitude: 54.63524
    }
  },
  {
    urlName: 'BidaZayed',
    location: 'Bida Zayed',
    city: 'Bida Zayed',
    coordinates: {
      latitude: 23.65065,
      longitude: 53.70369
    }
  },
  {
    urlName: 'Gayathi',
    location: 'Gayathi',
    city: 'Gayathi',
    coordinates: {
      latitude: 23.83111,
      longitude: 52.81086
    }
  },
  {
    urlName: 'Liwa',
    location: 'Liwa',
    city: 'Liwa',
    coordinates: {
      latitude: 23.09554,
      longitude: 53.60660
    }
  },
  {
    urlName: 'RuwaisTransco',
    location: 'Ruwais',
    city: 'Ruwais',
    coordinates: {
      latitude: 24.09085,
      longitude: 52.75504
    }
  },
  {
    urlName: 'E11Road',
    location: 'E11Road',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.03296,
      longitude: 53.88497
    }
  }
];
