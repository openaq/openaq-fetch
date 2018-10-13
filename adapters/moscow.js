'use strict';

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants';
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import { flattenDeep, isFinite } from 'lodash';
import { parallel } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';
import Iconv from 'iconv';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

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

      data = Buffer.from(data, 'binary');
      var iconv = new Iconv('windows-1251', 'utf-8');
      data = iconv.convert(data).toString();

      let stationRegexp = /air-today\/station\/(\w*)\//;
      let stationId = stationRegexp.exec(link)[1];

      formatData(data, stationId, (measurements) => {
        return done(null, measurements);
      });
    });
  };
};

const formatData = function (data, stationId, cb) {
  const $ = cheerio.load(data);

  let regex = /«(.*)»/;
  let match = regex.exec($('caption').text());
  let location;
  if (match) {
    location = match[1].trim();
  } else {
    // this shouldn't happen
    return cb([]);
  }
  // basically matches "М1 (Жубелино)"
  let mobileRegexp = /[\u041c]{1}[\d]?[\s]?\([\u0400-\u04ff]*\)/;
  // skip mobile stations for the time being
  if (mobileRegexp.test(location)) {
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

  base = Object.assign(base, moscowLocations[stationId]);

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
            day: lastFullDate.date(),
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

// generated with ../data_scripts/moscow-locations.js
const moscowLocations = {
  nekrasovka: { coordinates: { longitude: 37.9251911, latitude: 55.6792295 } },
  zhulebino: { coordinates: { longitude: 37.8637683, latitude: 55.6877099 } },
  kapotnya: { coordinates: { longitude: 37.8024261, latitude: 55.6379378 } },
  golovacheva: { coordinates: { longitude: 37.8185243, latitude: 55.6729927 } },
  rogovo: { coordinates: { longitude: 37.0753701, latitude: 55.2139442 } },
  troitsk: { coordinates: { longitude: 37.2967351, latitude: 55.4735266 } },
  kozuhovskaya: { coordinates: { longitude: 37.6585581, latitude: 55.7087026 } },
  shabol: { coordinates: { longitude: 37.6066741, latitude: 55.726868 } },
  spirid: { coordinates: { longitude: 37.5914501, latitude: 55.7602761 } },
  kazak: { coordinates: { longitude: 37.6595461, latitude: 55.7639729 } },
  biryulevo: { coordinates: { longitude: 37.6416281, latitude: 55.5807814 } },
  chayanova: { coordinates: { longitude: 37.5886271, latitude: 55.7756566 } },
  butlerova: { coordinates: { longitude: 37.5466771, latitude: 55.6496763 } },
  cheremushki: { coordinates: { longitude: 37.5793151, latitude: 55.6809484 } },
  gagrina: { coordinates: { longitude: 37.5776631, latitude: 55.7083636 } },
  marin: { coordinates: { longitude: 37.7460631, latitude: 55.6532082 } },
  gurevsk: { coordinates: { longitude: 37.7457201, latitude: 55.6059416 } },
  lyublino: { coordinates: { longitude: 37.7378231, latitude: 55.6703477 } },
  hamovniki: { coordinates: { longitude: 37.5659901, latitude: 55.7209092 } },
  losinyj: { coordinates: { longitude: 37.7497101, latitude: 55.8313719 } },
  kojuhovo: { coordinates: { longitude: 37.9038391, latitude: 55.7240871 } },
  polyarnaya: { coordinates: { longitude: 37.6350171, latitude: 55.8750566 } },
  ostankino: { coordinates: { longitude: 37.630405, latitude: 55.82202 } },
  madi: { coordinates: { longitude: 37.5249901, latitude: 55.8033388 } },
  maslovka: { coordinates: { longitude: 37.578854, latitude: 55.7918627 } },
  dolgoprud: { coordinates: { longitude: 37.5340191, latitude: 55.8948011 } },
  turist: { coordinates: { longitude: 37.4189531, latitude: 55.8566022 } },
  mgu: { coordinates: { longitude: 37.5365711, latitude: 55.7005288 } },
  kutuz_2: { coordinates: { longitude: 37.5393521, latitude: 55.7389987 } },
  zelen_11: { coordinates: { longitude: 37.1721415, latitude: 55.99404 } },
  zelen_15: { coordinates: { longitude: 37.1495393, latitude: 55.9769678 } },
  zelen_6: { coordinates: { longitude: 37.2278382, latitude: 55.9901541 } },
  veshnyaki: { coordinates: { longitude: 37.7917901, latitude: 55.7213102 } },
  zvenigorod: { coordinates: { longitude: 36.8385311, latitude: 55.7344558 } },
  chura: { coordinates: { longitude: 37.6036491, latitude: 55.6995479 } },
  suhar: { coordinates: { longitude: 37.6267581, latitude: 55.7738826 } },
  scherbinka: { coordinates: { longitude: 37.5586511, latitude: 55.5086715 } },
  semenkovo: { coordinates: { longitude: 37.1077611, latitude: 55.28905 } },
  kuznetsovo: { coordinates: { longitude: 36.9408421, latitude: 55.4565211 } },
  salarevo: { coordinates: { longitude: 37.4273051, latitude: 55.6198662 } },
  proletarskiy: { coordinates: { longitude: 37.6535471, latitude: 55.6365687 } },
  guryanova: { coordinates: { longitude: 37.7169917, latitude: 55.679127 } },
  glebovskaya: { coordinates: { longitude: 37.7128781, latitude: 55.8154194 } },
  melitopolskaya: { coordinates: { longitude: 37.5752861, latitude: 55.5368277 } },
  spartakovskaya: { coordinates: { longitude: 37.6799531, latitude: 55.7769576 } },
  narod_op: { coordinates: { longitude: 37.4726541, latitude: 55.7771916 } },
  vernad: { coordinates: { longitude: 37.4716145, latitude: 55.6586483 } },
  mojayskoe_sh: { coordinates: { longitude: 37.3994641, latitude: 55.7218592 } },
  svetly: { coordinates: { longitude: 37.4882323, latitude: 55.814244 } },
  koptevo: { coordinates: { longitude: 37.5226504, latitude: 55.831692 } },
  novokosino: { coordinates: { longitude: 37.8583166, latitude: 55.7348085 } },
  m4perovo: { coordinates: { longitude: 37.799495, latitude: 55.742365 } },
  lobachevskogo: { coordinates: { longitude: 37.5076756, latitude: 55.6654413 } },
  ochakovskoe: { coordinates: { longitude: 37.4553337, latitude: 55.6935911 } },
  mvidnoe: { coordinates: { longitude: 37.726001, latitude: 55.5412776 } }
};
