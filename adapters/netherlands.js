'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import async from 'async';
import { removeUnwantedParameters } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'netherlands';

exports.fetchData = function (source, cb) {
  var finalURL = source.url;
  request(finalURL, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Fetch list with available files from server
    var fileList = listApachetree(body, finalURL);

    // Filter list so it only contains the most recent group of files.
    var recentDate = _.last(fileList).date.getTime();
    var recentFiles = _.filter(fileList, function (f) {
      return f.date.getTime() === recentDate && f.size !== 0;
    });

    var tasks = [];

    _.forEach(recentFiles, function (f) {
      var task = function (cb) {
        // download the xml
        request(f.url, function (err, res, body) {
          if (err || res.statusCode !== 200) {
            return cb(err || res);
          }

          // pass the data to formatData
          var mData = formatData(f.name, body);
          cb(null, mData);
        });
      };

      tasks.push(task);
    });

    async.parallel(tasks, function (err, results) {
      if (err) {
        return cb({message: 'Failure to load data urls.'});
      }

      var result = {
        name: 'unused',
        measurements: _.flatten(results)
      };

      // Remove unwanted parameters
      result.measurements = removeUnwantedParameters(result.measurements);

      cb(null, result);
    });
  });
};

// Parses an Apache directory listing and returns an array with the files
// in the root
var listApachetree = function (data, url) {
  var $ = cheerio.load(data);

  var parseDate = function (ds) {
    var date = moment.tz(ds, 'DD-MMM-YYYY HH:mm', 'Europe/Amsterdam');
    return date.toDate();
  };

  var allFiles = [];

  $('tr').each(function (i, elem) {
    // Files are stored in <td>. Skip the rows that don't contain them
    if ($(this).find('td').length === 0) {
      return true;
    }

    var fp = [];
    $('td', this).each(function (i, elem) {
      fp[i] = $(this).text();
    });

    var f = {
      name: fp[1],
      url: url + fp[1],
      date: parseDate(fp[2]),
      size: fp[3].trim()
    };
    allFiles.push(f);
  });

  return allFiles;
};

var coordinates = {
  'NL10243': [51.5475, 5.8382],
  'NL10418': [51.9142, 4.47992],
  'NL10741': [51.8414, 5.85778],
  'NL10547': [52.2351, 5.18155],
  'NL10247': [51.4074, 5.39333],
  'NL10549': [52.2574, 5.2359],
  'NL10445': [52.0751, 4.31587],
  'NL10448': [51.9271, 4.46134],
  'NL10818': [52.6541, 6.01757],
  'NL10107': [51.1192, 6.0424],
  'NL49551': [52.463, 4.60184],
  'NL49704': [52.428, 4.77348],
  'NL01491': [51.9385, 4.43069],
  'NL10444': [52.2966, 4.51082],
  'NL10235': [51.4344, 4.35984],
  'NL49016': [52.394, 4.87016],
  'NL49002': [52.3854, 4.87575],
  'NL49572': [52.4744, 4.6288],
  'NL10437': [51.7866, 4.45053],
  'NL01494': [51.9214, 4.40139],
  'NL10807': [52.3883, 6.40293],
  'NL10937': [53.2178, 6.5789],
  'NL10633': [52.138, 4.83819],
  'NL10742': [51.8382, 5.85694],
  'NL10447': [52.1678, 4.50756],
  'NL10929': [52.8757, 6.93243],
  'NL49017': [52.358, 4.8997],
  'NL49020': [52.3748, 4.86032],
  'NL49564': [52.3275, 4.71501],
  'NL50007': [50.8521, 5.6758],
  'NL10241': [51.6031, 4.78102],
  'NL10136': [50.888, 5.9705],
  'NL01488': [51.8936, 4.48753],
  'NL10938': [53.2465, 6.60894],
  'NL49546': [52.4202, 4.83206],
  'NL01486': [51.8879, 4.38881],
  'NL10230': [51.5184, 5.14845],
  'NL10240': [51.5935, 4.82494],
  'NL10442': [51.8007, 4.70824],
  'NL10918': [52.9169, 5.57349],
  'NL10138': [50.9003, 5.98685],
  'NL10631': [52.4487, 5.61921],
  'NL10301': [51.6347, 3.91662],
  'NL10538': [52.8037, 5.05051],
  'NL50009': [50.8598, 5.71381],
  'NL10636': [52.105, 5.12446],
  'NL49703': [52.3984, 4.72858],
  'NL50002': [50.9631, 5.8107],
  'NL49014': [52.3597, 4.86621],
  'NL01495': [51.932, 4.22802],
  'NL49021': [52.3207, 4.9884],
  'NL49012': [52.39, 4.88781],
  'NL10131': [51.5405, 5.85307],
  'NL10246': [51.6537, 4.51527],
  'NL50004': [50.8459, 5.71475],
  'NL10318': [51.2945, 3.74948],
  'NL10545': [52.3395, 4.84102],
  'NL10404': [52.0771, 4.28919],
  'NL50003': [50.9844, 5.82223],
  'NL10133': [50.9023, 5.88175],
  'NL49556': [52.5636, 4.8617],
  'NL49565': [52.28, 4.77077],
  'NL10643': [52.1013, 5.12818],
  'NL01493': [51.9271, 4.46134],
  'NL10722': [52.0918, 6.60537],
  'NL49573': [52.4789, 4.57934],
  'NL10446': [52.039, 4.35938],
  'NL10641': [52.2015, 4.98744],
  'NL10237': [51.4442, 5.44483],
  'NL49003': [52.3893, 4.94382],
  'NL10244': [51.5359, 5.80859],
  'NL10617': [52.4232, 5.59338],
  'NL49570': [52.4893, 4.64053],
  'NL49561': [52.334, 4.77401],
  'NL01483': [51.8701, 4.31806],
  'NL01496': [51.9778, 4.12194],
  'NL10236': [51.4687, 5.47235],
  'NL01489': [51.8694, 4.58006],
  'NL10738': [52.1116, 5.70842],
  'NL10550': [52.3705, 4.64232],
  'NL01485': [51.8674, 4.35524],
  'NL10821': [52.2345, 6.91949],
  'NL10433': [51.9105, 4.3263],
  'NL49022': [52.3668, 4.79334],
  'NL10644': [51.9745, 4.9233],
  'NL01487': [51.8911, 4.48069],
  'NL49007': [52.3813, 4.84523],
  'NL10934': [53.3304, 6.27681],
  'NL49019': [52.3721, 4.9044],
  'NL49553': [52.494, 4.60199],
  'NL49701': [52.448, 4.81671],
  'NL50006': [51.4541, 6.1082],
  'NL10639': [52.0677, 5.12051]
};

var formatData = function (name, data) {
  var $ = cheerio.load(data, {xmlMode: true});

  // Determine what parameter is measured from the file-name
  var regExp = new RegExp('[0-9]+-(.+).xml');
  var p = name.match(regExp)[1].replace('.', '').toLowerCase();

  var parseDate = function (string) {
    var date = moment.tz(string, 'YYYYMMDDHHmmss', 'Europe/Amsterdam');

    return {utc: date.toDate(), local: date.format()};
  };

  var getStationId = function (string) {
    // Some locations don't have their full ID in the XML. In that case,
    // it can always be prepended by 'NL10'
    // http://www.lml.rivm.nl/tabel/ versus http://www.lml.rivm.nl/sos/
    var li = (string.length === 3) ? ('NL10' + string) : string;
    return li;
  };

  // Location names are reported as follows: 'Eindhoven-Genovevalaan'
  // The first is the city, the second usually some type of road
  // In some cases, the first part contains PNH (Province of North Holland)
  // which needs to be removed as well.
  var getCity = function (string) {
    var splitLocation = string.split('-');
    var cityName = splitLocation[0].replace('PNH ', '');
    return cityName;
  };

  // RIVM has to be attributed first. If another organization is
  // mentioned, pass in it in the second place.
  var getAttribution = function (string) {
    var attribution = [{name: 'RIVM', url: 'http://www.lml.rivm.nl/'}];
    if (string && string.trim() !== '' && string !== 'RIVM') {
      var provider = {name: string};
      attribution.push(provider);
    }
    return attribution;
  };

  // Hardcode the averaging periods for PM10 and PM2.5
  var getPeriod = function (string) {
    if ((string === 'pm25') || (string === 'pm10')) {
      return {'value': 24, 'unit': 'hours'};
    } else {
      return {'value': 1, 'unit': 'hours'};
    }
  };

  var measurements = [];

  // Loop over each <ROW> in the XML and store the measurement
  $('ROW').each(function (i, elem) {
    var stationID = getStationId($('STAT_NUMMER', this).text());

    var m = {
      date: parseDate($('MWAA_EINDDATUMTIJD', this).text()),
      parameter: p,
      location: $('STAT_NAAM', this).text(),
      value: Number($('MWAA_WAARDE', this).text()),
      unit: 'µg/m³',
      stationId: stationID,
      city: getCity($('STAT_NAAM', this).text()),
      attribution: getAttribution($('OPST_OPDR_ORGA_CODE', this).text()),
      averagingPeriod: getPeriod(p)
    };
    // Catch missing coords https://github.com/openaq/openaq-fetch/issues/425
    if (coordinates[stationID]) {
      m.coordinates = {
        latitude: coordinates[stationID][0],
        longitude: coordinates[stationID][1]
      };
    }
    measurements.push(m);
  });

  return measurements;
};
