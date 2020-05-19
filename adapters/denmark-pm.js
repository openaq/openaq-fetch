'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'denmark-pm';

exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

var formatData = function (result) {
  var getCoordinates = function (id) {
    switch (id) {
      case 'København - H. C. Andersens Boulevard':
        return {'city': 'Copenhagen', 'latitude': 55.67431, 'longitude': 12.57108};
      case 'Land - Risø':
        return {'city': 'Risø', 'latitude': 55.694, 'longitude': 12.08867};
      case 'Aarhus - Banegårdsgade':
        return {'city': 'Aarhus', 'latitude': 56.15042, 'longitude': 10.20069};
      default:
        return undefined;
    }
  };
  // Load the html into Cheerio
  var $ = cheerio.load(result, {decodeEntities: false});
  // Transform the data from each table into json
  var stations = [];
  $('.col-lg-6').each(function () {
    var rendered = $(this).html();
    var data = rendered.substring(rendered.indexOf('= [{') + 3, rendered.indexOf('];'));
    var param = rendered.substring(rendered.indexOf('.title') + 10, rendered.length);
    param = param.substring(0, param.indexOf('};'));
    param = (String(param).search('PM10') != -1) ? 'pm10' : 'pm25';
    if (data.length > 100) {
      try {
        data = JSON.parse(data);
        data.parameter = param;
        data.meta = getCoordinates(data.name);
        stations.push(data);
      } catch (e) { console.log(e)};
    }
  });
  var measurements = [];
  stations.forEach((station) => {
    // Since the timestamp is not specified in the html file, but the data is clearly the data from 1.5 hours ago
    // It is needed to just take the probable time of the data, and then just go down an hour for each value, to get the correct timestamps
    var basedate = moment().subtract(1.5, 'hours').startOf('minute');
    if (basedate.minute() < 30) {
      basedate.startOf('hour');
    } else {
      basedate.subtract(basedate.minute() % 30, 'minutes');
    }
    var base = {
      location: station.name,
      city: station.meta.city,
      parameter: station.parameter,
      coordinates: {
        latitude: station.meta.latitude,
        longitude: station.meta.longitude
      },
      unit: 'µg/m³',
      attribution: [{name: 'Aarhus universitet', url: 'https://www.au.dk/'}],
      averagingPeriod: {unit: 'hours', value: 1}
    }
    for(var i = station.data.length - 1; i >= 0; i--){
      const dateMoment = moment.tz(basedate, 'YYYY-MM-DD HH:mm', 'Europe/Copenhagen');
      var m = Object.assign({
        value: Number(station.data[i]),
        date: {
          utc: dateMoment.toDate(),
          local: dateMoment.format()
        }
      }, base);
      measurements.push(m);
      basedate = basedate.subtract(1, 'hours');
    }
  });
  return {name: 'unused', measurements: measurements};
};
