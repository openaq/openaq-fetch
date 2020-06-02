/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data from Abu Dhabi in the United Arab Emirates
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
import { unifyParameters } from '../lib/utils';
import { join } from 'path';

require('ssl-root-cas/latest')
  .inject()
  .addFile(join(__dirname, '..', '/certs/ADAir.crt.txt'));

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
      request(sourceName,
        function (err, res, body) {
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
  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var parseDate = function (m) {
    // The input date is not in a recognized format, so the string needs to be transformed
    m = moment(m, 'MM/DD/YYYY HH:mm a');
    var date = moment.tz(m, 'YYYY-MM-DD HH:mm', 'Asia/Dubai');
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
        if (key !== 'DateTime' && key !== 'AQI') {
          var m = _.clone(base);
          m.parameter = key;
          m.date = date;
          m.value = (key === 'CO') ? (Number(value) * 1000) : Number(value);
          m = unifyParameters(m);
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

/* Coordinates are fetched by using transforming the geometry positions from
  https://services.arcgis.com/kuR0ZmzEAOg4q3DU/arcgis/rest/services/AirQuality_Pics/FeatureServer/0/query?f=json&where=1%3D1&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=
  into usable geometry with the calculator from this site
  https://epsg.io/transform#s_srs=3857&t_srs=4326
*/
const stations = [
  {
    urlName: 'AlAinSchool',
    location: 'Al Ain Islamic Institute',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.2190093,
      longitude: 55.7348393
    }
  },
  {
    urlName: 'AlAinStreet',
    location: 'Al Tayseer Street',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.2261798,
      longitude: 55.765823
    }
  },
  {
    urlName: 'AlMaqta',
    location: 'Al Maqtaa',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.4037259,
      longitude: 54.5162126
    }
  },
  {
    urlName: 'AlQuaa',
    location: 'Al Quaa',
    city: 'Al Quaa',
    coordinates: {
      latitude: 23.5308087,
      longitude: 55.4859262
    }
  },
  {
    urlName: 'Habshan',
    location: 'Biljian',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 23.7504126,
      longitude: 53.7458552
    }
  },
  {
    urlName: 'HamdanStreet',
    location: 'Hamdan Street',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.4889191,
      longitude: 54.3636999
    }
  },
  {
    urlName: 'KhadijaSchool',
    location: 'Khadeeja School',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.4815689,
      longitude: 54.3693316
    }
  },
  {
    urlName: 'KhalifaCity',
    location: 'Khalifa City A',
    city: 'Khalifa City',
    coordinates: {
      latitude: 24.4199791,
      longitude: 54.5785249
    }
  },
  {
    urlName: 'KhalifaSchool',
    location: 'Khalifa Bin Zayed Secondary School',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.430162,
      longitude: 54.4080899
    }
  },
  {
    urlName: 'Mussafah',
    location: 'Mussafah',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.3472949,
      longitude: 54.5029305
    }
  },
  {
    urlName: 'AlTawia',
    location: 'Al Tawia',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.2592835,
      longitude: 55.7049407
    }
  },
  {
    urlName: 'Zakher',
    location: 'Zakher',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.1634814,
      longitude: 55.7021987
    }
  },
  {
    urlName: 'AlMafraq',
    location: 'Al Mafraq',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.2862522,
      longitude: 54.5888933
    }
  },
  {
    urlName: 'Sweihan',
    location: 'Sweihan',
    city: 'Al Ain',
    coordinates: {
      latitude: 24.4666818,
      longitude: 55.342881
    }
  },
  {
    urlName: 'Baniyas',
    location: 'Baniyas School',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.3213815,
      longitude: 54.6360422
    }
  },
  {
    urlName: 'BidaZayed',
    location: 'Bida Zayed',
    city: 'Bida Zayed',
    coordinates: {
      latitude: 23.6521322,
      longitude: 53.7030852
    }
  },
  {
    urlName: 'Gayathi',
    location: 'Gayathi',
    city: 'Gayathi',
    coordinates: {
      latitude: 23.8356045,
      longitude: 52.810022
    }
  },
  {
    urlName: 'Liwa',
    location: 'Liwa',
    city: 'Liwa',
    coordinates: {
      latitude: 23.0957772,
      longitude: 53.6064018
    }
  },
  {
    urlName: 'RuwaisTransco',
    location: 'Ruwais',
    city: 'Ruwais',
    coordinates: {
      latitude: 24.0908732,
      longitude: 52.75477
    }
  },
  {
    urlName: 'E11Road',
    location: 'E11Road',
    city: 'Abu Dhabi',
    coordinates: {
      latitude: 24.0333937,
      longitude: 53.8858092
    }
  }
];
