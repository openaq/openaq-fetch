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
    location = match[1].trim();
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
  
  base = Object.assign(base, moscowLocations[base.location]);

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

// generated with ../data_scripts/moscow-locations.js
const moscowLocations = {
	"Мобильная станция №1": {
		"coordinates": {
			"longitude": 37.9251911,
			"latitude": 55.6792295
		}
	},
	"Жулебино": {
		"coordinates": {
			"longitude": 37.8637683,
			"latitude": 55.6877099
		}
	},
	"Капотня": {
		"coordinates": {
			"longitude": 37.8024261,
			"latitude": 55.6379378
		}
	},
	"Головачева": {
		"coordinates": {
			"longitude": 37.8185243,
			"latitude": 55.6729927
		}
	},
	"Рогово": {
		"coordinates": {
			"longitude": 37.0753701,
			"latitude": 55.2139442
		}
	},
	"Троицк": {
		"coordinates": {
			"longitude": 37.2967351,
			"latitude": 55.4735266
		}
	},
	"Кожуховский проезд": {
		"coordinates": {
			"longitude": 37.6585581,
			"latitude": 55.7087026
		}
	},
	"Шаболовка": {
		"coordinates": {
			"longitude": 37.6066741,
			"latitude": 55.726868
		}
	},
	"Спиридоновка": {
		"coordinates": {
			"longitude": 37.5914501,
			"latitude": 55.7602761
		}
	},
	"Казакова": {
		"coordinates": {
			"longitude": 37.6595461,
			"latitude": 55.7639729
		}
	},
	"Бирюлево": {
		"coordinates": {
			"longitude": 37.6416281,
			"latitude": 55.5807814
		}
	},
	"Чаянова": {
		"coordinates": {
			"longitude": 37.5886271,
			"latitude": 55.7756566
		}
	},
	"Бутлерова": {
		"coordinates": {
			"longitude": 37.5466771,
			"latitude": 55.6496763
		}
	},
	"Черемушки": {
		"coordinates": {
			"longitude": 37.5793151,
			"latitude": 55.6809484
		}
	},
	"Площадь Гагарина": {
		"coordinates": {
			"longitude": 37.5776631,
			"latitude": 55.7083636
		}
	},
	"Марьино": {
		"coordinates": {
			"longitude": 37.7460631,
			"latitude": 55.6532082
		}
	},
	"Гурьевский проезд": {
		"coordinates": {
			"longitude": 37.7457201,
			"latitude": 55.6059416
		}
	},
	"Люблино": {
		"coordinates": {
			"longitude": 37.7378231,
			"latitude": 55.6703477
		}
	},
	"Хамовники": {
		"coordinates": {
			"longitude": 37.5659901,
			"latitude": 55.7209092
		}
	},
	"Лосиный остров": {
		"coordinates": {
			"longitude": 37.7497101,
			"latitude": 55.8313719
		}
	},
	"Кожухово": {
		"coordinates": {
			"longitude": 37.9038391,
			"latitude": 55.7240871
		}
	},
	"Полярная": {
		"coordinates": {
			"longitude": 37.6350171,
			"latitude": 55.8750566
		}
	},
	"Останкино": {
		"coordinates": {
			"longitude": 37.630405,
			"latitude": 55.82202
		}
	},
	"МАДИ": {
		"coordinates": {
			"longitude": 37.5249901,
			"latitude": 55.8033388
		}
	},
	"Нижняя Масловка": {
		"coordinates": {
			"longitude": 37.578854,
			"latitude": 55.7918627
		}
	},
	"Долгопрудная": {
		"coordinates": {
			"longitude": 37.5340191,
			"latitude": 55.8948011
		}
	},
	"Туристская": {
		"coordinates": {
			"longitude": 37.4189531,
			"latitude": 55.8566022
		}
	},
	"МГУ": {
		"coordinates": {
			"longitude": 37.5365711,
			"latitude": 55.7005288
		}
	},
	"Кутузовский 2": {
		"coordinates": {
			"longitude": 37.5393521,
			"latitude": 55.7389987
		}
	},
	"Зеленоград 11": {
		"coordinates": {
			"longitude": 37.1721415,
			"latitude": 55.99404
		}
	},
	"Зеленоград 16": {
		"coordinates": {
			"longitude": 37.1495393,
			"latitude": 55.9769678
		}
	},
	"Зеленоград 6": {
		"coordinates": {
			"longitude": 37.2278382,
			"latitude": 55.9901541
		}
	},
	"Вешняки": {
		"coordinates": {
			"longitude": 37.7917901,
			"latitude": 55.7213102
		}
	},
	"Звенигород": {
		"coordinates": {
			"longitude": 36.8385311,
			"latitude": 55.7344558
		}
	},
	"Чура": {
		"coordinates": {
			"longitude": 37.6036491,
			"latitude": 55.6995479
		}
	},
	"Сухаревка": {
		"coordinates": {
			"longitude": 37.6267581,
			"latitude": 55.7738826
		}
	},
	"Щербинка": {
		"coordinates": {
			"longitude": 37.5586511,
			"latitude": 55.5086715
		}
	},
	"Семенково": {
		"coordinates": {
			"longitude": 37.1077611,
			"latitude": 55.28905
		}
	},
	"пос. Кузнецово": {
		"coordinates": {
			"longitude": 36.9408421,
			"latitude": 55.4565211
		}
	},
	"Саларьево": {
		"coordinates": {
			"longitude": 37.4273051,
			"latitude": 55.6198662
		}
	},
	"Пролетарский проспект": {
		"coordinates": {
			"longitude": 37.6535471,
			"latitude": 55.6365687
		}
	},
	"Гурьянова": {
		"coordinates": {
			"longitude": 37.7169917,
			"latitude": 55.679127
		}
	},
	"Глебовская": {
		"coordinates": {
			"longitude": 37.7128781,
			"latitude": 55.8154194
		}
	},
	"Мелитопольская": {
		"coordinates": {
			"longitude": 37.5752861,
			"latitude": 55.5368277
		}
	},
	"Спартаковская пл.": {
		"coordinates": {
			"longitude": 37.6799531,
			"latitude": 55.7769576
		}
	},
	"Народного ополчения": {
		"coordinates": {
			"longitude": 37.4726541,
			"latitude": 55.7771916
		}
	},
	"Ак. Анохина": {
		"coordinates": {
			"longitude": 37.4716145,
			"latitude": 55.6586483
		}
	},
	"Толбухина": {
		"coordinates": {
			"longitude": 37.3994641,
			"latitude": 55.7218592
		}
	},
	"Светлый проезд": {
		"coordinates": {
			"longitude": 37.4882323,
			"latitude": 55.814244
		}
	},
	"Коптевский": {
		"coordinates": {
			"longitude": 37.5226504,
			"latitude": 55.831692
		}
	},
	"Новокосино": {
		"coordinates": {
			"longitude": 37.8583166,
			"latitude": 55.7348085
		}
	},
	"М4 (Перовская)": {
		"coordinates": {
			"longitude": 37.799495,
			"latitude": 55.742365
		}
	},
	"М (Лобачевского)": {
		"coordinates": {
			"longitude": 37.5076756,
			"latitude": 55.6654413
		}
	},
	"М1 (Очаковское)": {
		"coordinates": {
			"longitude": 37.4553337,
			"latitude": 55.6935911
		}
	},
	"М (Видное)": {
		"coordinates": {
			"longitude": 37.726001,
			"latitude": 55.5412776
		}
	}
}

