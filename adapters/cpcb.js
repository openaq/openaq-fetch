'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import { filter, flattenDeep, isFinite } from 'lodash';
import { parallel } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'cpcb';

export function fetchData (source, cb) {
  // Load initial page to get individual states
  request(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    const $ = cheerio.load(body);
    // Loop over each state and add tasks
    let tasks = [];
    const states = grabActive($);
    states.forEach((e, i) => {
      tasks.push(handleState($(e)));
    });

    parallel(tasks, (err, results) => {
      // Turn into a single array
      results = flattenDeep(results);

      // Be kind, convert
      results = convertUnits(results);

      return cb(err, {name: 'unused', measurements: results});
    });
  });
}

const handleState = function (e) {
  return function (done) {
    // Get state id and name for url
    const regex = /\((\d+),/;
    const match = regex.exec(e.attr('onclick'));
    const stateID = match[1];
    const stateName = e.attr('id');
    const stateURL = `http://www.cpcb.gov.in/CAAQM/mapPage/${stateName}.aspx?stateID=${stateID}`;

    // Grab page for each state
    request(stateURL, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      // Grab only the divs with active gifs
      const $ = cheerio.load(body);
      const cities = grabActive($);
      let tasks = [];
      cities.forEach((e, i) => {
        tasks.push(handleCity($(e)));
      });

      parallel(tasks, (err, results) => {
        done(err, results);
      });
    });
  };
};

const handleCity = function (e) {
  return function (done) {
    // Get city info for url, multiple formats
    let match = /\((\d+),/.exec(e.attr('onclick'));
    let matchDelhi = /\(this.id,(\d+),(\d+)\)/.exec(e.attr('onclick'));
    if (match) {
      const cityID = match[1];
      const cityURL = `http://www.cpcb.gov.in/CAAQM/frmStationdetails.aspx?cityID=${cityID}`;

      // Grab page for each city to get stations
      request(cityURL, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }

        // Handle each city
        let tasks = [];
        const $ = cheerio.load(body);
        $('.gridrow').each((i, e) => {
          const dataURL = `http://www.cpcb.gov.in/CAAQM/${$('a', $('td', $(e)).get(2)).attr('href')}`;
          const detailsURL = `http://www.cpcb.gov.in/CAAQM/${$('a', $('td', $(e)).get(3)).attr('href')}`;
          tasks.push(handleStation(dataURL, detailsURL));
        });

        parallel(tasks, (err, results) => {
          return done(err, results);
        });
      });
    } else if (matchDelhi) {
      // Handle special Delhi case where we go right to stations
      const dataURL = `http://www.cpcb.gov.in/CAAQM/frmCurrentDataNew.aspx?StationName=${e.attr('id')}&StateId=${matchDelhi[1]}&CityId=${matchDelhi[2]}`;
      const detailsURL = `http://www.cpcb.gov.in/CAAQM/frmStationDescription.aspx?StationName=${e.attr('id')}&StateId=${matchDelhi[1]}&CityId=${matchDelhi[2]}`;
      let tasks = [handleStation(dataURL, detailsURL)]; // Doing this to make it look like async form
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    } else {
      // Handle case where there is no match
      return done(null, []);
    }
  };
};

const handleStation = function (dataURL, detailsURL) {
  // Get both data and details for each station
  return function (done) {
    let tasks = {
      data: (done) => {
        request(dataURL, (err, res, body) => {
          if (err || res.statusCode !== 200) {
            return done({message: 'Failure to load data url.'});
          }
          return done(null, body);
        });
      },
      details: (done) => {
        request(detailsURL, (err, res, body) => {
          if (err || res.statusCode !== 200) {
            return done({message: 'Failure to load details url.'});
          }
          return done(null, body);
        });
      }
    };

    parallel(tasks, (err, results) => {
      if (err) {
        return done(null, []);
      }

      formatData(results, (measurements) => {
        return done(null, measurements);
      });
    });
  };
};

const getTime = function (text) {
  const s = /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/.exec(text)[1];
  const date = moment.tz(s, 'DD/MM/YYYY HH:mm:ss', 'Asia/Kolkata');

  return {utc: date.toDate(), local: date.format()};
};

const renameParameter = function (parameter) {
  switch (parameter) {
    case 'Nitrogen Dioxide':
      return 'no2';
    case 'Sulphur Dioxide':
    case 'Sulfur Dioxide':
      return 'so2';
    case 'Carbon Monoxide':
      return 'co';
    case 'PM2.5':
    case 'PM 2.5':
      return 'pm25';
    case 'Ozone':
      return 'o3';
    case 'PM10':
    case 'PM 10':
      return 'pm10';
    default:
      return parameter;
  }
};

const formatData = function (result, cb) {
  const details = cheerio.load(result.details);
  const $ = cheerio.load(result.data);
  let base = {
    city: details('#lblCity').html(),
    location: details('#lblStation').text(),
    averagingPeriod: {unit: 'hours', value: 0.25},
    attribution: [{
      name: 'Central Pollution Control Board',
      url: 'http://www.cpcb.gov.in/CAAQM'
    }]
  };

  // Add coords in they're not 0,0
  const coordinates = {
    latitude: Number(details('#lblLatitude').text()),
    longitude: Number(details('#lblLongitude').text())
  };
  if (coordinates.latitude !== 0 && coordinates.longitude !== 0) {
    base.coordinates = coordinates;
  }

  // Loop over individual parameters to get measurements
  let measurements = [];
  $('tr', $('#Td1')).each((i, e) => {
    // Skip first tr since it's the header
    if (i === 0) {
      return;
    }

    // Get base
    let m = Object.assign({}, base);

    // Rename parameter and make sure we want it
    m.parameter = renameParameter($($('td', $(e)).get(0)).text());
    if (acceptableParameters.indexOf(m.parameter) === -1) {
      return;
    }

    // Add date
    m.date = getTime(`${$($('td', $(e)).get(1)).text()} ${$($('td', $(e)).get(2)).text()}`);

    // Get value and unit
    m.unit = $($('td', $(e)).get(4)).text().trim();
    if (m.unit === 'µg/m3' || m.unit === 'µg|m3') {
      m.unit = 'µg/m³';
    } else if (m.unit === 'mg/m3') {
      m.unit = 'mg/m³';
    }
    m.value = Number($($('td', $(e)).get(3)).text());
    if (!isFinite(m.value)) {
      return;
    }

    // Save to array
    measurements.push(m);
  });

  return cb(measurements);
};

const grabActive = function ($) {
  // Only return ones that are active
  return filter($('div'), (e) => {
    return $(e).html().indexOf('active.gif') !== -1;
  });
};
