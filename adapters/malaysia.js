/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Malaysian data sources.
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
import { join } from 'path';

// Adding in certs to get around unverified connection issue
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'malaysia';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
exports.fetchData = function (source, cb) {
  // Fetch both the measurements and meta-data about the locations
  var sources = [source.url, 'http://apims.doe.gov.my/data/public_v2/CAQM/caqmstation.json'];
  var tasks = [];

  _.forEach(sources, function (e) {
    var task = function (cb) {
      request(e, function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb(err || res);
        }
        cb(null, body);
      });
    };

    tasks.push(task);
  });

  async.parallel(tasks, function (err, results) {
    if (err) {
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
   * A method for parsing and combining the metadata and dataset, into a readable JSON object
   * @param {object} dataset Dataset from the source
   * @param {object} metadata Metadata from the source
   * @return {object} A parsed list of objects of stations, and their data
   */
  var parseData = function (dataset, metadata) {
    dataset= JSON.parse(dataset);
    metadata = JSON.parse(metadata);
    var stations = [];
    for (let i = 0; i < metadata.station_info_apims.length; i += 4) {
      const station = {
        Location : metadata.station_info_apims[i],
        latitude : Number((metadata.station_info_apims[i + 3])),
        longitude : Number((metadata.station_info_apims[i + 2]))
      };
      stations.push(station);
    }
    var stationData = [];
    for (let i = 1; i < dataset['24hour_api_apims'].length; i++) {
      var dataObject = {};
      // The JSON data from the source is just a list of strings, and the timestamps for the data varies, data has to be parsed before it is read 
      var time = {};
      for (let j = 0; j < dataset['24hour_api_apims'][0].length; j++) {
        if (dataset['24hour_api_apims'][0][j] == 'State' || dataset['24hour_api_apims'][0][j] == 'Location') {
          dataObject[dataset['24hour_api_apims'][0][j]] = dataset['24hour_api_apims'][i][j];
        } else {
          time[dataset['24hour_api_apims'][0][j]] = dataset['24hour_api_apims'][i][j];
        }
      }
      dataObject.data = time;
      var stationMetaData = stations.filter(
        function (s) {return s.Location == dataObject.Location;}
      );
      dataObject = {...stationMetaData[0], ...dataObject};
      stationData.push(dataObject);
    }
    return stationData;
  }
  try {
    var data = parseData(results[0],results[1]);
  } catch (e) {
    return undefined;
  }
  /**
   * Given a measurement object, convert to system appropriate times.
   * @param {object} m A source measurement object
   * @return {object} An object containing both UTC and local times
   */
  var parseDate = function (m) {
    var date = moment.tz(m, 'YYYY-MM-DD HH:mm', 'Asia/Kuala_Lumpur');
    return {utc: date.toDate(), local: date.format()};
  };
  /**
   * Given a string which contains value and a symbol for unit and parameter
   * @param {String} v value to be parsed
   * @return {object} An object containing units, parameters and values of the data
   */
  var parseValue = function (v) {
    const types = [
      {
        marker : '[**]',
        marker2 : '**',
        parameter : 'pm25',
        unit : 'µg/m³'
      },
      {
        marker : 'c',
        marker2 : 'c',
        parameter : 'o3',
        unit : 'ppm'
      },
      {
        marker : '[*]',
        marker2 : '*',
        parameter : 'pm10',
        unit : 'µg/m³'
      },
      {
        marker : 'a',
        marker2 : 'a',
        parameter : 'so2',
        unit : 'ppm'
      },
      {
        marker : 'b',
        marker2 : 'b',
        parameter : 'no2',
        unit : 'ppm'
      },
      {
        marker : 'd',
        marker2 : 'd',
        parameter : 'co',
        unit : 'ppm'
      },
    ]
    for (let i = 0; i < types.length; i++) {
      if(String(v).search(String(types[i].marker)) != -1) {
        return {...types[i], value : Number(String(v).replace(types[i].marker2, ''))}
      }
    }
    return null;
  }
  var measurements = [];
  _.forEach(data, function (s) {
    var base = {
      city: s.Location,
      location: s.Location,
      coordinates: {
        latitude: s.latitude,
        longitude: s.longitude
      },
      attribution: [
        {name: 'DOE Malaysia', url: 'http://apims.doe.gov.my/public_v2/home.html'},
      ]
    };
    var startTime = String(Object.keys(s.data)[0]).replace('AM', ' AM').replace('PM', ' PM');
    var date = (startTime == '12:00 AM') ? 
    moment(moment().startOf('day').format('YYYY-MM-DD') + ' ' + startTime, 'YYYY-MM-DD HH:mm')
    :
    moment(moment().subtract(1, 'days').startOf('day').format('YYYY-MM-DD') + ' ' + startTime, 'YYYY-MM-DD HH:mm');
    for (let i = 0; i < 24; i++) {
      var m =  _.clone(base);
      m.date = parseDate(date);
      var parseVal = parseValue(Object.values(s.data)[i]);
      if (parseVal != null) {
        m.parameter = parseVal.parameter;
        m.value = parseVal.value;
        m.unit = parseVal.unit;
        measurements.push(m);
      }
      date = moment(date).add(1, 'hours');
    }
  }); 
  return {
    name: 'unused',
    measurements: measurements
  };
};
