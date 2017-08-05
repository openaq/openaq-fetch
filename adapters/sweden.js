'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { acceptableParameters } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'sweden';

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
  var measurements = [];

  // Source: Hardcoded in source-code in http://slb.nu/slbanalys/matningar/
  var getCoordinates = function (id) {
    switch (id) {
      case 'Högdalen':
        return {'latitude': 59.26086482, 'longitude': 18.06166762};
      case 'Gävle Södra Kungsgatan':
        return {'latitude': 60.67155223, 'longitude': 17.14691497};
      case '59.83238423, 18.63132007':
        return {'latitude': 59.83238423, 'longitude': 18.63132007};
      case 'Brännkyrkaskolan':
        return {'latitude': 59.30426591, 'longitude': 18.01762040};
      case 'Töjnaskolan':
        return {'latitude': 59.42370559, 'longitude': 17.92887634};
      case 'Norr Malma (regional bakgrund)':
        return {'latitude': 59.83171574, 'longitude': 18.63317244};
      case 'Torkel Knutssonsgatan (tak)':
        return {'latitude': 59.31600560, 'longitude': 18.05780160};
      case 'Uppsala Marsta':
        return {'latitude': 59.92596545, 'longitude': 17.58700716};
      case 'E4':
        return {'latitude': 59.48583073, 'longitude': 17.91964065};
      case 'Hornsgatan':
        return {'latitude': 59.31713214, 'longitude': 18.04878744};
      case 'Sveavägen':
        return {'latitude': 59.34516113, 'longitude': 18.05428175};
      case 'Folkungagatan':
        return {'latitude': 59.31462368, 'longitude': 18.07585555};
      case 'Hågelbyleden Botkyrka':
        return {'latitude': 59.23705806, 'longitude': 17.83833241};
      case 'Gröndalsskolan':
        return {'latitude': 59.31349142, 'longitude': 18.00469473};
      case 'Fleminggatan (projekt)':
        return {'latitude': 59.33375997, 'longitude': 18.03684915};
      case 'E4 Sollentuna Häggvik':
        return {'latitude': 59.44353901, 'longitude': 17.92236122};
      case 'Norrlandsgatan':
        return {'latitude': 59.33635627, 'longitude': 18.07062632};
      case 'Södertälje Turingegatan':
        return {'latitude': 59.19812352, 'longitude': 17.62108719};
      case 'Ekmansväg':
        return {'latitude': 59.48900019, 'longitude': 17.92020954};
      case 'Eriksbergsskolan':
        return {'latitude': 59.41018492, 'longitude': 17.95779851};
      case 'Falun, Svärdsjögatan':
        return {'latitude': 60.60798503, 'longitude': 15.63367903};
      case 'Södertalje, Birkakorset':
        return {'latitude': 59.20135294, 'longitude': 17.63475503};
      case 'E4/E20 Lilla Essingen':
      case 'Lilla Essingen (E4/E20)':
        return {'latitude': 59.32551867, 'longitude': 18.00396061};
      case 'Uppsala Kungsgatan':
        return {'latitude': 59.85953006, 'longitude': 17.64248414};
      default:
        return undefined;
    }
  };

  // Load the html into Cheerio
  var $ = cheerio.load(result, {decodeEntities: false});

  // select the relevant JS nodes
  var nodes = [];
  var parameters = [];

  $('.entry-content script').each(function () {
    var rendered = $(this).html();
    if (rendered.startsWith('\r\n\t')) {
      // extract data table
      var data = rendered.substring(rendered.indexOf('arrayToDataTable('));
      data = data.substring(18, data.indexOf(']);'));
      data = data.replace('[', '').trim();
      data = data.split("'").join('').trim(); // remove all [

      var param = rendered.substring(rendered.indexOf('visualization.LineChart'));
      param = param.substring(param.indexOf('.getElementById(\'') + 17);
      param = param.substring(0, param.indexOf('_'));

      if (acceptableParameters.indexOf(param) === -1) {
        return;
      }

      if (data.length > 20) {
        nodes.push(data);
        parameters.push(param);
      }
    }
  });

  // Iterate over different quantitites (PM10, NO2, PM25, O3)
  nodes.forEach((node, nodeIndex) => {
    // Parse data table
    var rows = node.split('],[');
    var legend = rows.shift().split(',');

    // Iterate over the last 24 hours of measurements
    rows.forEach((row, index) => {
      row = row.split(']').join('').trim().split(',');

      // First column contains the hour of the recordings
      var date = moment.tz(row[0], 'HH:mm', 'Europe/Stockholm').date(moment().date());

      // Adapt date to yesterday for the relevant measurements
      if (date > moment(rows[rows.length - 1], 'HH:mm').date(moment().date())) {
        date.subtract(1, 'day');
      }

      date = {utc: date.toDate(), local: date.format()};

      // Now loop over all the measurements, for now just try and insert them
      // all and let them fail at insert time. This could probably be more
      // efficient.
      legend.forEach((e, i) => {
        // Filter out time or background columns
        if (e === 'Tid' || e.includes('bakgrund')) {
          return;
        }

        var city = 'Stockholm';
        if (e.includes('Uppsala')) city = 'Uppsala';
        if (e.includes('Gävle')) city = 'Gävle';

        var base = {
          location: e,
          city: city,
          attribution: [{name: 'SLB', 'url': 'http://slb.nu/slbanalys/luften-idag/'}],
          averagingPeriod: {'value': 1, 'unit': 'hours'},
          coordinates: getCoordinates(e)
        };

        var value = row[i];

        if (value !== '' && value !== ' ' && value !== '\n') {
          // Copy base measurement
          var m = _.cloneDeep(base);
          m.date = date;
          m.value = Number(value.trim());
          m.parameter = parameters[nodeIndex];
          m.unit = 'µg/m³';

          // Add to array if value is valid
          if (!isNaN(m.value)) {
            measurements.push(m);
          }
        }
      });
    });
  });

  return {name: 'unused', measurements: measurements};
};
