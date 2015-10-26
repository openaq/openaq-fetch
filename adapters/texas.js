'use strict';

var request = require('request').defaults({jar: true}); // Turning on cookie saving
var _ = require('lodash');
var moment = require('moment-timezone');
var async = require('async');
var cheerio = require('cheerio');
var utils = require('../lib/utils');

exports.name = 'texas';

exports.fetchData = function (source, cb) {
  // Load a page first to get all the data sources we want from the select dropdown
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load source url.'});
    }

    var $ = cheerio.load(body);
    var cams = [];
    var saveCams = false;
    $('option', $('[name=cams]')).each(function (idx, o) {
      // A bit hacky to only get Houston for now
      if ($(o).attr('value') === 'config') {
        if ($(o).text().indexOf('Houston') !== -1) {
          saveCams = true;
        } else {
          saveCams = false;
        }
      }
      // Stop if we're not saving
      if (!saveCams) {
        return;
      }

      // Don't save deactivated stations
      if ($(o).text().indexOf('Deactivated') === -1) {
        cams.push($(o).attr('value'));
      }
    });
    // Remove first item since it's a config option
    cams.shift();

    var tasks = {};
    _.forEach(cams, function (c) {
      var task = function (cb) {
        // Load the initial page to get the plot url which is what we want to parse
        request.post({url: source.url, form: {cams: c}}, function (err, res, body) {
          if (err || res.statusCode !== 200) {
            return cb(err || res);
          }

          var url = getPlotURL(body);
          // Grab the plot url and load it
          request(url, function (err, res, body) {
            if (err || res.statusCode !== 200) {
              return cb(err || res);
            }

            return cb(null, body);
          });
        });
      };

      tasks[c] = task;
    });

    async.parallelLimit(tasks, 4, function (err, results) {
      if (err) {
        return console.error(err);
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

// Grab the plot url from the JS
// http://www.tceq.state.tx.us/assets/public/compliance/monops/plots/11341.html
var getPlotURL = function (body) {
  var start = body.indexOf('/assets/public/compliance/monops/plots/');
  var end = body.indexOf('"', start);
  var url = body.substr(start, end - start);
  return 'http://www.tceq.state.tx.us' + url;
};

var coordinates = {
  '618': {
    'Latitude': 29.144291,
    'Longitude': -95.756601,
    'Owned By': 'Brazoria County - Sweeny Industry Group'
  },
  '619': {
    'Latitude': 29.308562,
    'Longitude': -95.19991,
    'Owned By': 'Brazoria County - Chocolate Bayou Industry Group'
  },
  '11': {
    'Latitude': 29.0108409,
    'Longitude': -95.397744,
    'Owned By': 'TCEQ'
  },
  '84': {
    'Latitude': 29.5204432,
    'Longitude': -95.3925089,
    'Owned By': 'TCEQ'
  },
  '1012': {
    'Latitude': 28.96443,
    'Longitude': -95.35483,
    'Owned By': 'TCEQ'
  },
  '1016': {
    'Latitude': 29.0437592,
    'Longitude': -95.4729462,
    'Owned By': 'TCEQ'
  },
  '96': {
    'Latitude': 29.5462437,
    'Longitude': -94.7869686,
    'Owned By': 'TCEQ'
  },
  '696': {
    'Latitude': 29.5741,
    'Longitude': -95.6497,
    'Owned By': 'University of Houston'
  },
  '1022': {
    'Latitude': 29.3852338,
    'Longitude': -94.9315197,
    'Owned By': 'TCEQ'
  },
  '620': {
    'Latitude': 29.4057,
    'Longitude': -94.94712,
    'Owned By': 'Texas City Industry Group'
  },
  '571': {
    'Latitude': 29.525556,
    'Longitude': -95.070556,
    'Owned By': 'University of Houston'
  },
  '1615': {
    'Latitude': 29.38145,
    'Longitude': -94.94108,
    'Owned By': 'Marathon Petroleum Co.'
  },
  '615': {
    'Latitude': 29.38145,
    'Longitude': -94.94108,
    'Owned By': 'Marathon Petroleum Co.'
  },
  '616': {
    'Latitude': 29.36886,
    'Longitude': -94.91544,
    'Owned By': 'Marathon Petroleum Co.'
  },
  '1616': {
    'Latitude': 29.36886,
    'Longitude': -94.91544,
    'Owned By': 'Marathon Petroleum Co.'
  },
  '1621': {
    'Latitude': 29.380981,
    'Longitude': -94.93022,
    'Owned By': 'Marathon Petroleum Co.'
  },
  '621': {
    'Latitude': 29.380981,
    'Longitude': -94.93022,
    'Owned By': 'Marathon Petroleum Co.'
  },
  '683': {
    'Latitude': 29.3787,
    'Longitude': -94.91019,
    'Owned By': 'Marathon Petroleum Co.'
  },
  '697': {
    'Latitude': 29.3879,
    'Longitude': -95.0414,
    'Owned By': 'University of Houston'
  },
  '1034': {
    'Latitude': 29.2544736,
    'Longitude': -94.8612886,
    'Owned By': 'TCEQ'
  },
  '5005': {
    'Latitude': 29.270278,
    'Longitude': -94.864167,
    'Owned By': 'National Weather Service'
  },
  '8': {
    'Latitude': 29.9010364,
    'Longitude': -95.3261373,
    'Owned By': 'TCEQ'
  },
  '108': {
    'Latitude': 29.9010364,
    'Longitude': -95.3261373,
    'Owned By': 'TCEQ'
  },
  '150': {
    'Latitude': 29.9010364,
    'Longitude': -95.3261373,
    'Owned By': 'TCEQ'
  },
  '15': {
    'Latitude': 29.8027073,
    'Longitude': -95.1254948,
    'Owned By': 'TCEQ'
  },
  '115': {
    'Latitude': 29.8027073,
    'Longitude': -95.1254948,
    'Owned By': 'TCEQ'
  },
  '154': {
    'Latitude': 30.039524,
    'Longitude': -95.6739508,
    'Owned By': 'TCEQ'
  },
  '110': {
    'Latitude': 30.039524,
    'Longitude': -95.6739508,
    'Owned By': 'TCEQ'
  },
  '26': {
    'Latitude': 30.039524,
    'Longitude': -95.6739508,
    'Owned By': 'TCEQ'
  },
  '1036': {
    'Latitude': 29.7761,
    'Longitude': -95.1051,
    'Owned By': 'TCEQ'
  },
  '405': {
    'Latitude': 29.8280859,
    'Longitude': -95.2840958,
    'Owned By': 'City of Houston Health Department'
  },
  '408': {
    'Latitude': 29.834167,
    'Longitude': -95.489167,
    'Owned By': 'City of Houston Health Department'
  },
  '409': {
    'Latitude': 29.623889,
    'Longitude': -95.474167,
    'Owned By': 'City of Houston Health Department'
  },
  '181': {
    'Latitude': 29.6957294,
    'Longitude': -95.499219,
    'Owned By': 'TCEQ'
  },
  '146': {
    'Latitude': 29.6957294,
    'Longitude': -95.499219,
    'Owned By': 'TCEQ'
  },
  '53': {
    'Latitude': 29.6957294,
    'Longitude': -95.499219,
    'Owned By': 'TCEQ'
  },
  '167': {
    'Latitude': 29.734231,
    'Longitude': -95.238469,
    'Owned By': 'TCEQ'
  },
  '1667': {
    'Latitude': 29.734231,
    'Longitude': -95.238469,
    'Owned By': 'TCEQ'
  },
  '148': {
    'Latitude': 29.7706975,
    'Longitude': -95.0312316,
    'Owned By': 'TCEQ'
  },
  '404': {
    'Latitude': 29.8074146,
    'Longitude': -95.2936223,
    'Owned By': 'City of Houston Health Department'
  },
  '145': {
    'Latitude': 29.6150008,
    'Longitude': -95.0181324,
    'Owned By': 'TCEQ'
  },
  '406': {
    'Latitude': 29.625556,
    'Longitude': -95.267222,
    'Owned By': 'City of Houston Health Department'
  },
  '410': {
    'Latitude': 29.723333,
    'Longitude': -95.635833,
    'Owned By': 'City of Houston Health Department'
  },
  '169': {
    'Latitude': 29.7062492,
    'Longitude': -95.2611301,
    'Owned By': 'TCEQ'
  },
  '411': {
    'Latitude': 29.752778,
    'Longitude': -95.350278,
    'Owned By': 'City of Houston Health Department'
  },
  '1029': {
    'Latitude': 29.718799,
    'Longitude': -95.2599093,
    'Owned By': 'TCEQ'
  },
  '416': {
    'Latitude': 29.686389,
    'Longitude': -95.294722,
    'Owned By': 'City of Houston Health Department'
  },
  '551': {
    'Latitude': 29.8586111,
    'Longitude': -95.1602778,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '552': {
    'Latitude': 29.7330556,
    'Longitude': -94.9847222,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '553': {
    'Latitude': 29.9208333,
    'Longitude': -95.0683333,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '554': {
    'Latitude': 29.8330556,
    'Longitude': -95.6569444,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '556': {
    'Latitude': 29.6552778,
    'Longitude': -95.0097222,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '557': {
    'Latitude': 30.0380556,
    'Longitude': -95.3811111,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '558': {
    'Latitude': 29.5894444,
    'Longitude': -95.3536111,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '559': {
    'Latitude': 29.8105556,
    'Longitude': -95.8061111,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '560': {
    'Latitude': 29.961944,
    'Longitude': -95.235,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '561': {
    'Latitude': 30.011667,
    'Longitude': -95.5225,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '562': {
    'Latitude': 29.778333,
    'Longitude': -95.538056,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '563': {
    'Latitude': 30.05786,
    'Longitude': -95.06147,
    'Owned By': 'Harris County Health and Environmental Services'
  },
  '570': {
    'Latitude': 29.5488889,
    'Longitude': -95.1852778,
    'Owned By': 'University of Houston'
  },
  '572': {
    'Latitude': 29.583333,
    'Longitude': -95.105,
    'Owned By': 'University of Houston'
  },
  '617': {
    'Latitude': 29.821389,
    'Longitude': -94.99,
    'Owned By': 'Houston Regional Monitoring'
  },
  '669': {
    'Latitude': 29.694722,
    'Longitude': -95.252778,
    'Owned By': 'Texas Petrochemicals'
  },
  '670': {
    'Latitude': 29.701944,
    'Longitude': -95.257222,
    'Owned By': 'Texas Petrochemicals'
  },
  '671': {
    'Latitude': 29.706111,
    'Longitude': -95.255,
    'Owned By': 'Goodyear Tire & Rubber Co'
  },
  '673': {
    'Latitude': 29.7023,
    'Longitude': -95.256697,
    'Owned By': 'Goodyear Tire & Rubber Co'
  },
  '695': {
    'Latitude': 29.7176,
    'Longitude': -95.3414,
    'Owned By': 'University of Houston'
  },
  '603': {
    'Latitude': 29.7647877,
    'Longitude': -95.1785379,
    'Owned By': 'Houston Regional Monitoring'
  },
  '114': {
    'Latitude': 29.7647877,
    'Longitude': -95.1785379,
    'Owned By': 'Houston Regional Monitoring'
  },
  '1015': {
    'Latitude': 29.7616528,
    'Longitude': -95.0813861,
    'Owned By': 'TCEQ'
  },
  '165': {
    'Latitude': 29.7616528,
    'Longitude': -95.0813861,
    'Owned By': 'TCEQ'
  },
  '1017': {
    'Latitude': 29.823319,
    'Longitude': -94.983786,
    'Owned By': 'TCEQ'
  },
  '1': {
    'Latitude': 29.7679965,
    'Longitude': -95.2205822,
    'Owned By': 'TCEQ'
  },
  '55': {
    'Latitude': 29.7337263,
    'Longitude': -95.2575931,
    'Owned By': 'City of Houston Health Department'
  },
  '113': {
    'Latitude': 29.7337263,
    'Longitude': -95.2575931,
    'Owned By': 'City of Houston Health Department'
  },
  '304': {
    'Latitude': 29.7337263,
    'Longitude': -95.2575931,
    'Owned By': 'City of Houston Health Department'
  },
  '403': {
    'Latitude': 29.7337263,
    'Longitude': -95.2575931,
    'Owned By': 'City of Houston Health Department'
  },
  '35': {
    'Latitude': 29.670025,
    'Longitude': -95.1285077,
    'Owned By': 'TCEQ'
  },
  '139': {
    'Latitude': 29.670025,
    'Longitude': -95.1285077,
    'Owned By': 'TCEQ'
  },
  '235': {
    'Latitude': 29.670025,
    'Longitude': -95.1285077,
    'Owned By': 'TCEQ'
  },
  '1001': {
    'Latitude': 29.670025,
    'Longitude': -95.1285077,
    'Owned By': 'TCEQ'
  },
  '3000': {
    'Latitude': 29.670025,
    'Longitude': -95.1285077,
    'Owned By': 'TCEQ'
  },
  '309': {
    'Latitude': 30.0584604,
    'Longitude': -95.1897514,
    'Owned By': 'City of Houston Health Department'
  },
  '243': {
    'Latitude': 29.672,
    'Longitude': -95.0647,
    'Owned By': 'TCEQ'
  },
  '1049': {
    'Latitude': 29.716611,
    'Longitude': -95.2224669,
    'Owned By': 'TCEQ'
  },
  '45': {
    'Latitude': 29.5830473,
    'Longitude': -95.0155437,
    'Owned By': 'TCEQ'
  },
  '1052': {
    'Latitude': 29.81453,
    'Longitude': -95.38769,
    'Owned By': 'TCEQ'
  },
  '1066': {
    'Latitude': 29.7216,
    'Longitude': -95.49265,
    'Owned By': 'TCEQ'
  },
  '1020': {
    'Latitude': 29.6843603,
    'Longitude': -95.2535982,
    'Owned By': 'TCEQ'
  },
  '175': {
    'Latitude': 29.6843603,
    'Longitude': -95.2535982,
    'Owned By': 'TCEQ'
  },
  '699': {
    'Latitude': 30.0583,
    'Longitude': -94.9781,
    'Owned By': 'University of Houston'
  },
  '78': {
    'Latitude': 30.3503017,
    'Longitude': -95.4251278,
    'Owned By': 'TCEQ'
  },
  '698': {
    'Latitude': 30.2362,
    'Longitude': -95.4832,
    'Owned By': 'University of Houston'
  },
  '5006': {
    'Latitude': 30.356667,
    'Longitude': -95.413889,
    'Owned By': 'National Weather Service'
  },
  '5012': {
    'Latitude': 30.755278,
    'Longitude': -95.587222,
    'Owned By': 'National Weather Service'
  }
};

var formatData = function (results) {
  var measurements = [];

  var getParameter = function (param) {
    if (param.indexOf('Nitrogen Dioxide') !== -1) {
      return {parameter: 'no2', unit: 'ppb'};
    } else if (param.indexOf('Ozone') !== -1) {
      return {parameter: 'o3', unit: 'ppb'};
    } else if (param.indexOf('PM-2.5') !== -1 && param.indexOf('Acceptable') === -1) {
      return {parameter: 'pm25', unit: 'µg/m³'};
    } else if (param.indexOf('Carbon Monoxide') !== -1) {
      return {parameter: 'co', unit: 'ppm'};
    } else if (param.indexOf('Sulfur Dioxide') !== -1) {
      return {parameter: 'so2', unit: 'ppb'};
    } else if (param.indexOf('PM-10') !== -1) {
      return {parameter: 'pm10', unit: 'µg/m³'};
    } else {
      return undefined;
    }
  };

  var getDate = function (hour) {
    // Get today in Houston
    var date = moment().tz('America/Chicago').format('DD-MM-YYYY');
    var dateMoment = moment.tz(date + ' ' + hour, 'DD-MM-YYYY H', 'America/Chicago');
    return {utc: dateMoment.toDate(), local: dateMoment.format()};
  };

  // This will loop over each individual station plot we've received
  _.forEach(results, function (r, cam) {
    // Load the html into Cheerio
    var $ = cheerio.load(r);

    // Get the location from the first plot title
    var id = $('[name=chartTitle]').attr('value');
    if (!id) {
      return;
    }
    var split = id.split('-');
    var location = split[0].trim();

    var base = {
      location: location,
      city: 'Houston',
      attribution: [{'name': 'TCEQ', 'url': 'http://www.tceq.state.tx.us'}],
      averagingPeriod: {'value': 1, 'unit': 'hours'}
    };

    // Add extra attribution if present
    var a = coordinates[cam]['Owned By'];
    if (a !== 'TCEQ') {
      base.attribution.push({'name': a});
    }

    // Add coordinates if present
    if (coordinates[cam]) {
      base.coordinates = {
        'latitude': coordinates[cam]['Latitude'],
        'longitude': coordinates[cam]['Longitude']
      };
    }

    // Now loop over all the measurements, for now just try and insert them
    // all and let them fail at insert time. This could probably be more
    // efficient.
    $('.flot_plot_area').each(function (i, p) {
      // Make sure it's a parameter we want
      var param = $('[name=chartTitle]', p).attr('value');
      param = getParameter(param);
      if (!param) {
        return;
      }

      // Grab time and values and create measurements
      var values = $('[name=sampleValues_0]', p).attr('value').split(',');
      _.forEach(values, function (v, idx) {
        var m = _.cloneDeep(base);
        _.assign(m, param); // Adds parameter and unit
        // Make sure we have a valid number
        if (v === '' || v === ' ' || isNaN(v)) {
          return;
        }

        m.value = Number(v);
        m.date = getDate(idx);
        measurements.push(m);
      });
    });
  });

  // Convert to proper units
  measurements = utils.convertUnits(measurements);

  return {name: 'unused', measurements: measurements};
};
