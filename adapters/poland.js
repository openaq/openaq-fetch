'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { series } from 'async';
import { acceptableParameters } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT, jar: true}); // Turning on cookie saving

exports.name = 'poland';

exports.fetchData = function (source, cb) {
  // This is the list of individual station ids from
  // http://sojp.wios.warszawa.pl/?page=hourly-report&data=04-10-2015&site_id=69&csq_id=1414&dane=w1
  var stations = ['69', '19', '203', '14', '202', '17', '71', '16', '15', '195', '11', '194',
    '172', '12', '13', '18'];

  // There is some cookie checking going on within the site, so load the main
  // page first to get the cookie and then load the sites.
  request('http://sojp.wios.warszawa.pl/?l=en', function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load site.'});
    }

    var tasks = [];
    _.forEach(stations, function (s) {
      var task = function (cb) {
        var url = makeURL(source.url, s);
        request(url, function (err, res, body) {
          if (err || res.statusCode !== 200) {
            return cb(err || res);
          }
          return cb(null, body);
        });
      };

      tasks.push(task);
    });

    series(tasks, function (err, results) {
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
  });
};

// Build up the url string to query, should be of form
// http://sojp.wios.warszawa.pl/?page=hourly-report&data=04-10-2015&site_id=69&csq_id=1414&dane=w1
var makeURL = function (base, station) {
  // Get current date in Poland
  var date = moment().tz('Europe/Warsaw').format('DD-MM-YYYY');
  var url = base + '?page=hourly-report&csq_id=1414&dane=w1&';
  url += 'data=' + date + '&';
  url += 'site_id=' + station;

  return url;
};

var formatData = function (results) {
  var measurements = [];

  var getCoordinates = function (id) {
    switch (id) {
      case 'Guty Duże':
        return {'latitude': 52.943056, 'longitude': 21.289167};
      case 'Otwock-Brzozowa':
        return {'latitude': 52.115556, 'longitude': 21.239167};
      case 'Belsk-IGFPAN':
        return {'latitude': 51.83518056, 'longitude': 20.788889};
      case 'Granica-KPN':
        return {'latitude': 52.28585778, 'longitude': 20.45555556};
      case 'Legionowo-Zegrzyńska':
        return {'latitude': 52.40757694, 'longitude': 20.95555556};
      case 'Piastów-Pułaskiego':
        return {'latitude': 52.19172722, 'longitude': 20.83888889};
      case 'Płock-Gimnazjum':
        return {'latitude': 52.56083333, 'longitude': 19.68861111};
      case 'Płock-Reja':
        return {'latitude': 52.55094028, 'longitude': 19.70527778};
      case 'Radom-Tochtermana':
        return {'latitude': 51.39909556, 'longitude': 21.13916667};
      case 'Siedlce-Konarskiego':
        return {'latitude': 52.17203333, 'longitude': 22.27277778};
      case 'Warszawa-Komunikacyjna':
        return {'latitude': 52.21929306, 'longitude': 21.00583333};
      case 'Warszawa-Marszałkowska':
        return {'latitude': 52.22517222, 'longitude': 21.89311111};
      case 'Warszawa-Podleśna':
        return {'latitude': 52.28098306, 'longitude': 20.95555556};
      case 'Warszawa-Targówek':
        return {'latitude': 52.29085889, 'longitude': 21.03916667};
      case 'Warszawa-Ursynów':
        return {'latitude': 52.16077306, 'longitude': 21.03916667};
      case 'Żyrardów-Roosevelta':
        // Not present on the page (UTM values available but appear to be wrong) -CAH
        return undefined;
      default:
        return undefined;
    }
  };

  // This will loop over each individual station page we've received
  _.forEach(results, function (r) {
    // Load the html into Cheerio
    var $ = cheerio.load(r, {decodeEntities: false});

    // Store the order of the parameters in the header
    var parameters = [];
    $('thead tr th').each(function () {
      var param = $(this).html();
      parameters.push(param.toLowerCase()); // Get all parameters from th
    });
    parameters.shift(); // Remove first item since it's datetime
    parameters = parameters.splice(0, parameters.length / 2); // Cut in half since other half are units

    // Get the location and city from selected option
    var id = $('option[selected="selected"]').html();
    var split = id.split('-');
    var city = split[0];
    var location = split[1];

    // Special case for Guty Duże since it breaks the rules with city-location naming
    if (city === 'Guty Duże') {
      city = 'Warszawa';
      location = 'Guty Duże';
    }

    var base = {
      location: location,
      city: city,
      attribution: [{'name': 'WIOS', 'url': 'http://sojp.wios.warszawa.pl/'}],
      averagingPeriod: {'value': 1, 'unit': 'hours'},
      coordinates: getCoordinates(id)
    };

    // Now loop over all the measurements, for now just try and insert them
    // all and let them fail at insert time. This could probably be more
    // efficient.
    $('tbody tr').each(function (i, e) {
      // Get date
      var date = $(e).find('th').html();
      var dateMoment = moment.tz(date, 'YYYY-MM-DD HH:mm', 'Europe/Warsaw');
      date = {utc: dateMoment.toDate(), local: dateMoment.format()};

      // Split out measurements and create them if value is present
      $(e).find('td').each(function (i, e) {
        // Exit if this isn't a pollutant we want
        if (acceptableParameters.indexOf(parameters[i]) === -1) {
          return;
        }

        var value = $(e).html();
        if (value !== '' && value !== ' ' && value !== '\n') {
          // Copy base measurement
          var m = _.cloneDeep(base);
          m.date = date;
          m.value = Number(value.trim());
          m.parameter = parameters[i];
          m.unit = 'µg/m³';

          // Add to array
          measurements.push(m);
        }
      });
    });
  });

  return {name: 'unused', measurements: measurements};
};
