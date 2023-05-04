'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { convertUnits } from '../lib/utils.js';
import { default as baseRequest } from 'request';
import cloneDeep from 'lodash/cloneDeep.js';
import { DateTime } from 'luxon';
import { load } from 'cheerio';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'slovenia';

export function fetchData (source, cb) {
  request(source.url, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      let data = formatData(body, source);

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

const formatData = function (data, source) {
  const getDate = function (dateString) {
    const date = DateTime.fromFormat(dateString, 'yyyy-MM-dd HH:mm', { zone: 'Europe/Ljubljana' });

    return { utc: date.toUTC().toISO({ suppressMilliseconds: true }), local: date.toISO({ suppressMilliseconds: true }) };
  };

  const getUnit = function (parameter) {
    const units = {
      so2: 'µg/m³',
      co: 'mg/m³',
      o3: 'µg/m³',
      no2: 'µg/m³',
      pm10: 'µg/m³'
    };

    return units[parameter];
  };

  // Load all the XML
  const $ = load(data, { xmlMode: true });

  // Create measurements array
  let measurements = [];

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

  let baseObj = {
    averagingPeriod: {'value': 1, 'unit': 'hours'},
    attribution: [{
      name: source.name,
      url: source.sourceURL
    }]
  };

  // Loop over each item and save the object
  $('postaja').each(function (i, elem) {
    let coordinates = {
      latitude: parseFloat($(elem).attr('ge_sirina')),
      longitude: parseFloat($(elem).attr('ge_dolzina'))
    };

    let date = getDate($(elem).children('datum_do').text());
    let location = $(elem).children('merilno_mesto').text();

    $(elem).children().each(function (i, e) {
      // Currently only storing PM10 as the other measurements
      // should be picked up by EEA.
      if (this.tagName !== 'pm10') {
        return;
      }

      let obj = cloneDeep(baseObj);

      let unit = getUnit(this.tagName);
      let value = parseFloat($(this).text());

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
