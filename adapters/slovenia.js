'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { cloneDeep } from 'lodash';
import { default as moment } from 'moment-timezone';
import { convertUnits } from '../lib/utils';
import cheerio from 'cheerio';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'slovenia';

exports.fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body, source);

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

var formatData = function (data, source) {
  var getDate = function (dateString) {
    var date = moment.tz(dateString, 'YYYY-MM-DD HH:mm', 'Europe/Ljubljana');
    return {utc: date.toDate(), local: date.format()};
  };

  var getUnit = function (parameter) {
    var units = {
      'so2': 'µg/m³',
      'co': 'mg/m³',
      'o3': 'µg/m³',
      'no2': 'µg/m³',
      'pm10': 'µg/m³'
    };

    return units[parameter];
  };

  // Load all the XML
  var $ = cheerio.load(data, {xmlMode: true});

  // Create measurements array
  var measurements = [];

  // There are a number of "postaja" elements in this XML.
  // This is described (in Slovene) here: http://www.arso.gov.si/zrak/kakovost%20zraka/podatki/opis_ones_zrak_urni_xml.pdf
  // Summarized below:
  // <postaja> element contains:
  //   attributes: ge_dolzina=longitude ge_sirina=latitude
  //   elements:
  //   <merilno_mesto> - name of location
  //   <datum_od> - time of measurement start
  //   <datum_do> - time of measurement end
  //   <so2 > - hourly concentration of SO2 in µg/m³
  //   <co> - hourly concentration of CO in mg/m³
  //   <o3> - hourly concentration of O3 in µg/m³
  //   <no2> - hourly concentration of NO2 in µg/m³
  //   <pm10> - hourly concentration of PM10 in µg/m³

  var baseObj = {
    averagingPeriod: {'value': 1, 'unit': 'hours'},
    attribution: [{
      name: source.name,
      url: source.sourceURL
    }]
  };

  // Loop over each item and save the object
  $('postaja').each(function (i, elem) {
    var coordinates = {
      latitude: parseFloat($(elem).attr('ge_sirina')),
      longitude: parseFloat($(elem).attr('ge_dolzina'))
    };

    var date = getDate($(elem).children('datum_do').text());
    var location = $(elem).children('merilno_mesto').text();

    $(elem).children().each(function (i, e) {
      // Currently only storing PM10 as the other measurements
      // should be picked up by EEA.
      if (this.tagName !== 'pm10') {
        return;
      }

      var obj = cloneDeep(baseObj);

      var unit = getUnit(this.tagName);
      var value = parseFloat($(this).text());

      if (unit === 'mg/m³') {
        value = value * 1000;
      }

      if (unit && value) {
        // Since there is limited information, both city &
        // location will be set to same value.
        obj.city = location;
        obj.location = location;
        obj.parameter = this.tagName;
        obj.unit = 'µg/m³';
        obj.value = value;
        obj.coordinates = coordinates;
        obj.date = date;
        measurements.push(obj);
      }
    });
  });

  // Convert units to platform standard
  measurements = convertUnits(measurements);

  return {
    name: source.name,
    measurements: measurements
  };
};
