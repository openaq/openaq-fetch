'use strict';

import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
var Iconv = require('iconv').Iconv;
import { flattenDeep, isFinite } from 'lodash';
import { parallel } from 'async';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { acceptableParameters, convertUnits } from '../lib/utils';

export const name = 'moscow';

export function fetchData (source, cb) {
  request(source.url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    const $ = cheerio.load(body);
    let tasks = [];
    var links = $('a').filter(function (i, el) {
      return /air-today\/station/.exec($(this).attr('href'));
    });
    links.each(function (i, el) {
      let link = $(this).attr('href');
      link = 'http://mosecom.ru' + link;
      link = link.replace('index.php', 'table.html');
      tasks.push(handleStation(link));
    });

    parallel(tasks, (err, results) => {
      if (err) {
        return cb(err, []);
      }

      results = flattenDeep(results);
      results = convertUnits(results);

      return cb(err, {name: 'unused', measurements: results});
    });
  });
}

const handleStation = function (link) {
  return function (done) {
    request({
      uri: link,
      encoding: 'binary'
    }, (err, res, data) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      data = new Buffer(data, 'binary');
      var iconv = new Iconv('windows-1251', 'utf-8');
      data = iconv.convert(data).toString();

      formatData(data, (measurements) => {
        return done(null, measurements);
      });
    });
  };
};

const formatData = function (data, cb) {
  const $ = cheerio.load(data);

  let regex = /«(.*)»/;
  let match = regex.exec($('caption').text());
  let location;
  if (match) {
    location = match[1];
  } else {
    // this shouldn't happen
    return cb([]);
  }

  let base = {
    city: 'Moscow',
    location: location,
    averagingPeriod: {unit: 'hours', value: 1},
    attribution: [{
      name: 'Mosecomonitoring',
      url: 'http://mosecom.ru/air/'
    }]
  };

  let measurements = [];
  let parameters = {};
  let cols = 1;

  $('th.header').each(function (i, e) {
    // skip the date column
    if (i === 0) {
      return;
    }
    let param = $(this).text().split(' ')[0].toLowerCase();
    if (acceptableParameters.indexOf(param) > -1) {
      parameters[cols] = {
        name: param,
        unit: $('td.header').eq(cols - 1).text()
      };
    }
    if ($(this).attr('colspan')) {
      cols += Number($(this).attr('colspan'));
    } else {
      cols++;
    }
  });

  // keep track of the previous full date
  let lastFullDate;

  $('tr.evenarg, tr.oddarg').each(function (i, e) {
    let columns = $(this).children('td');

    let dateText = $(columns).first().text();
    let dateTime = getFullDate(dateText);
    if (dateTime.isValid()) {
      lastFullDate = dateTime;
    } else {
      if (lastFullDate) {
        let dayTime = moment(dateText, 'HH:mm');
        dateTime = moment.tz(
          {
            year: lastFullDate.year(),
            month: lastFullDate.month(),
            day: lastFullDate.day(),
            hour: dayTime.hour(),
            minute: dayTime.minute()
          },
          'Europe/Moscow');
      } else {
        // no known full date?
        // you've got a problem
      }
    }

    for (let i in parameters) {
      if (parameters.hasOwnProperty(i)) {
        let m = Object.assign({}, base);
        m.parameter = parameters[i].name;
        m.unit = parameters[i].unit;
        if (m.unit === 'мг / куб. м') {
          m.unit = 'mg/m³';
        }
        m.value = Number($(columns).eq(i).text());
        m.date = getTime(dateTime);
        if (isFinite(m.value)) {
          measurements.push(m);
        }
      }
    }
  });
  return cb(measurements);
};

const getFullDate = function (text) {
  const date = moment.tz(text, 'DD.MM.YYYY HH:mm', 'Europe/Moscow');
  return date;
};

const getTime = function (date) {
  return {utc: date.toDate(), local: date.format()};
};
