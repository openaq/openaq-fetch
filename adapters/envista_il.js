'use strict';

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants';
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import { flattenDeep, isFinite } from 'lodash';
import { filter, intersection, parallel, parallelLimit } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';

const headers = {
  'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:54.0) Gecko/20100101 Firefox/54.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Content-Type': 'text/html; charset=utf-8'
};

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT, jar: true, headers: headers});

export const name = 'envista_il';

export function fetchData (source, cb) {
  let menuSiteUrl = source.url + 'MenuSite.aspx';
  request({url: menuSiteUrl}, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    let tasks = [];
    let cityLinks = body.match(/DynamicTable.aspx\?G_ID=(\d*)/g);
    while (cityLinks.length > 0) {
      let link = source.url + cityLinks.pop();
      tasks.push(handleCity(source, link));
    }

    parallelLimit(tasks, 2, (err, results) => {
      if (err) {
        return cb(err, []);
      }

      results = flattenDeep(results);
      results = convertUnits(results);

      return cb(err, {name: 'unused', measurements: results});
    });
  });
}

const handleCity = function (source, link) {
  return function (done) {
    request(link, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      let tasks = [];
      let stationIds = body.match(/StationInfo[5]?.aspx\?ST_ID=(\d*)/g);
      let $ = cheerio.load(body);
      let regionName = $('#lblCaption').text().split(' - ')[1];
      while (stationIds.length > 0) {
        let link = source.url + stationIds.pop();
        link = link.replace(/StationInfo[5]?/, 'StationReportFast');
        tasks.push(handleStation(source, link, regionName));
      }
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

// station query page
const handleStation = function (source, link, regionName) {
  return function (done) {
    request(link, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      const $ = cheerio.load(body);
      if (!hasAcceptedParameters($)) {
        return done(null, []);
      }

      // Form inputs
      let form = {};
      form['__VIEWSTATE'] = $('#__VIEWSTATE').attr('value');
      form['__VIEWSTATEGENERATOR'] = $('#__VIEWSTATEGENERATOR').attr('value');
      let lstMonitors = encodeURIComponent(getLstMonitors($));
      // the system kept the / symbol unencoded
      lstMonitors = lstMonitors.replace(/%2F/g, '/');
      form['lstMonitors'] = lstMonitors;
      form['chkall'] = 'on';
      form['RadioButtonList1'] = 0;
      form['RadioButtonList2'] = 0;

      // base for txtStartTime_p & txtEndTime_p
      const txtEndTime = moment(
        $('#BasicDatePicker2_TextBox').attr('value'),
        'DD-MM-YYYY'
      );

      form['BasicDatePicker1$textBox'] = $('#BasicDatePicker1_TextBox').attr('value');
      form['txtStartTime'] = '00:00';
      form['BasicDatePicker2$textBox'] = $('#BasicDatePicker2_TextBox').attr('value');
      form['txtEndTime'] = '00:00';
      form['txtEndTime_p'] = txtEndTime.format('YYYY-M-DD') + '-0-0-0-0';
      form['txtStartTime_p'] = txtEndTime.subtract(1, 'day').format('YYYY-M-DD') + '-0-0-0-0';
      form['ddlAvgType'] = 'AVG';
      form['ddlTimeBase'] = 15;
      form['btnGenerateReport'] = 'הצג+דוח';

      // used to ignore fallbacks w/ 5 min avaraging period
      const minAvgPeriod = parseInt($('#ddlTimeBase').children()[0].attribs.value);
      const tasks = [queryStation(source, link, form, minAvgPeriod, regionName)];
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

// do station query
const queryStation = function (source, link, qform, minAvgPeriod, regionName) {
  return function (done) {
    request.post({
      url: link,
      form: qform,
      followAllRedirects: true
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      const $ = cheerio.load(body);
      const location = $('#lblStation').text();
      // replicate the export form
      let form = {};
      form['__EVENTTARGET'] = 'lnkExport';
      form['__EVENTARGUMENT'] = '';
      form['__VIEWSTATE'] = $('#__VIEWSTATE').attr('value');
      form['__VIEWSTATEGENERATOR'] = $('#__VIEWSTATEGENERATOR').attr('value');
      form['__EVENTVALIDATION'] = $('#__EVENTVALIDATION').attr('value');
      form['ddlExport'] = 'XML';
      form['lblCurrentPage'] = '1';

      let exportLink;
      try {
        exportLink = $('#form1').attr('action');
        // temp measure
        exportLink = exportLink.replace('./NewGrid', 'NewGrid');
      } catch (err) {
        return done(null, []);
      }

      exportLink = source.url + exportLink;
      const tasks = [exportStationXML(source, exportLink, form, location, minAvgPeriod, regionName)];
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

// do export from query result
const exportStationXML = function (source, link, form, location, minAvgPeriod, regionName) {
  return function (done) {
    request.post({
      url: link,
      form: form
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      formatData(source, body, link, location, minAvgPeriod, regionName, (measurements) => {
        return done(null, measurements);
      });
    });
  };
};

const formatData = function (source, data, link, location, minAvgPeriod, regionName, cb) {
  try {
    const $ = cheerio.load(data, { xmlMode: true });
    let base = {
      city: regionName,
      location: location,
      averagingPeriod: {unit: 'hours', value: 0.25},
      attribution: [{
        name: 'Israel Ministry of Environmental Protection',
        url: source.url
      }]
    };
    base = Object.assign(base, coordinates[location]);

    let rFullDate = /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})/;
    let measurements = [];
    $('data').filter(function (i, el) {
      return rFullDate.test($(this).attr('value'));
    }).each(function (i, el) {
      let dateM = rFullDate.exec($(this).attr('value'));
      let dateProp = getDate(dateM[0], source.timezone);
      let rParamUnit = /(\w*)\[ ([\w\d]*)\]/i;
      $(this).find('name').filter(function (i, el) {
        let match = rParamUnit.exec($(this).text());
        if (!match) { return false; }
        return acceptableParameters.indexOf(match[1].toLowerCase()) >= 0;
      }).each(function (i, el) {
        let paramUnitM = rParamUnit.exec($(this).text());
        let m = Object.assign({}, base);
        if (m !== null) {
          m.parameter = paramUnitM[1].toLowerCase();
          m.date = dateProp;
          m.coordinates = matchCoordinates(location);
          m.unit = paramUnitM[2];
          m.value = Number($(this).next().text());
          if (isFinite(m.value)) {
            measurements.push(m);
          }
        }
      });
    });
    return cb(measurements);
  } catch (err) {
    // in event exportLink is not working, grab the current data from the
    // station page's dynamicTable, but only if it has valid averagingPeriod
    if (minAvgPeriod <= 10) {
      return cb([]);
    }
    return dynamicTableFallback(link, source, minAvgPeriod, cb);
  }
};

const getDate = function (s, timezone) {
  const date = moment.tz(s, 'DD/MM/YYYY HH:mm', timezone);
  return {utc: date.toDate(), local: date.format()};
};

const hasAcceptedParameters = function ($) {
  let acceptedCount = $('#M_lstMonitors').children().filter(function (i, el) {
    let monitor = $(this).find('span[igtxt=1]').first().text();
    return acceptableParameters.indexOf(monitor.toLowerCase()) >= 0;
  }).length;
  return Boolean(acceptedCount);
};

const getLstMonitors = function ($) {
  let monitorsCount = $('#M_lstMonitors').children().length;
  let monitorsToCheck = [];
  $('#M_lstMonitors').children().filter(function (i, el) {
    let monitor = $(this).find('span[igtxt=1]').first().text();
    return acceptableParameters.indexOf(monitor.toLowerCase()) >= 0;
  }).each(function (i, el) {
    monitorsToCheck.push(Number($(this).attr('igtag')));
  });
  let xmlMonitors = ['<WebTree><Nodes>'];
  for (let i = 1; i <= monitorsCount; i++) {
    let isChecked = false;
    if (monitorsToCheck.indexOf(i) >= 0) {
      isChecked = true;
    }
    let monitorNode = `<lstMonitors_${i} Checked="${isChecked}"></lstMonitors_${i}>`;
    xmlMonitors.push(monitorNode);
  }
  xmlMonitors.push('</Nodes></WebTree>');
  return xmlMonitors.join('');
};

var dynamicTableFallback = (link, source, minAvgPeriod, cb) => {
  // create link to page w/dynamic table
  link = link.replace(/fromfast=1&/, '');
  if (link.match(/Error/)) {
    link = link.replace(/Error/, 'StationInfo5');
  } else if (link.match(/NewGrid/)) {
    link = link.replace(/NewGrid/, 'StationInfo5');
  }
  request.get({
    url: link
  }, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb(null);
    }
    let $ = cheerio.load(body);
    // generate table, a list of rows from html table
    let table = filter(
      $('table[id="C1WebGrid1"]').children(),
      (obj) => {
        if (obj.name && obj.name === 'tr') {
          return obj;
        }
      }
    );
    // do not continue if data does not exist
    if (table === undefined) {
      return cb([]);
    }
    // strip out all characters except for actual data
    table = table.map((tr) => {
      return $(tr)
        .text()
        .replace(/\r\n\r\n/g, '')
        .split(/\t/)
        .slice(1, -1);
    });
    // two rows indicates no data.
    if (table.length > 2) {
      // get index of accpetable parameters in first row by finding index
      // for elements that intersect vals in acceptableParameters
      const acceptableIndices = intersection(
        table[0],
        acceptableParameters.map((acceptableParam) => { return acceptableParam.toUpperCase(); })
      ).map((acceptableParam) => { return table[0].indexOf(acceptableParam); });
      // for each accepted parameter, generate a measurement
      const measurements = acceptableIndices.map((paramIndex) => {
        if (!(table[2][paramIndex].match(/\s/))) {
          return {
            location: table[0][0],
            date: getDate(table[2][0]),
            parameter: table[0][paramIndex].toLowerCase(),
            coordinates: matchCoordinates(table[0][0]),
            value: parseFloat(table[2][paramIndex]),
            unit: table[1][paramIndex],
            attribution: [{
              name: 'Israel Ministry of Environmental Protection',
              url: source.url
            }],
            averagingPeriod: { unit: 'hours', value: (minAvgPeriod / 60) }
          };
        }
        // remove any undefined cases
      }).filter((measurement) => { return measurement !== undefined; });
      cb(measurements);
    }
  });
};

const matchCoordinates = function (location) {
  // return coordinates for record in coordinates w/key === location
  let matchingCoords = coordinates.find((coordinate) => {
    return Object.keys(coordinate)[0] === location;
  });
  return matchingCoords[Object.keys(matchingCoords)[0]]['coordinates'];
};

// generated with ../data_scripts/israel.js
// there is a hebrew letter yod that matches a single quote
// so, using double quotes here is best.
/* eslint-disable */
const coordinates = [
  {
    "ניידת נתניה": {
      "coordinates": {
        "latitude": 32.310944,
        "longitude": 34.874947
      }
    }
  },
  {
    "ניידת חיפה": {
      "coordinates": {
        "latitude": 32.856675,
        "longitude": 35.091557
      }
    }
  },
  {
    "תחנה ניידת ברכבת 1": {
      "coordinates": {
        "latitude": 31.987899,
        "longitude": 34.757384
      }
    }
  },
  {
    "ניידת6": {
      "coordinates": {
        "latitude": 32.81101,
        "longitude": 34.998101
      }
    }
  },
  {
    "ניידת5": {
      "coordinates": {
        "latitude": 32.79232,
        "longitude": 35.052037
      }
    }
  },
  {
    "ניידת4": {
      "coordinates": {
        "latitude": 32.064336,
        "longitude": 34.772514
      }
    }
  },
  {
    "ניידת2": {
      "coordinates": {
        "latitude": 31.845779,
        "longitude": 34.685015
      }
    }
  },
  {
    "ניידת1": {
      "coordinates": {
        "latitude": 32.100139,
        "longitude": 34.839027
      }
    }
  },
  {
    "ניידת קטנה": {
      "coordinates": {
        "latitude": 32.46044,
        "longitude": 35.069148
      }
    }
  },
  {
    "אילת גולדווטר": {
      "coordinates": {
        "latitude": 29.554579,
        "longitude": 34.94873
      }
    }
  },
  {
    "אילת 6": {
      "coordinates": {
        "latitude": 29.531814,
        "longitude": 34.939443
      }
    }
  },
  {
    "אילת 5": {
      "coordinates": {
        "latitude": 0,
        "longitude": 0
      }
    }
  },
  {
    "אילת 4": {
      "coordinates": {
        "latitude": 0,
        "longitude": 0
      }
    }
  },
  {
    "אילת 3": {
      "coordinates": {
        "latitude": 29.52961,
        "longitude": 34.938219
      }
    }
  },
  {
    "אילת 2": {
      "coordinates": {
        "latitude": 29.531813,
        "longitude": 34.939442
      }
    }
  },
  {
    "אילת1": {
      "coordinates": {
        "latitude": 29.531533,
        "longitude": 34.941072
      }
    }
  },
  {
    "שגב שלום": {
      "coordinates": {
        "latitude": 31.19889,
        "longitude": 34.83775
      }
    }
  },
  {
    "צ.הנגב": {
      "coordinates": {
        "latitude": 31.06631,
        "longitude": 34.83676
      }
    }
  },
  {
    "נגב מזרחי": {
      "coordinates": {
        "latitude": 31.24897,
        "longitude": 35.21597
      }
    }
  },
  {
    "מחנה נתן": {
      "coordinates": {
        "latitude": 31.2193,
        "longitude": 34.80466
      }
    }
  },
  {
    "ירוחם": {
      "coordinates": {
        "latitude": 30.98501,
        "longitude": 34.932
      }
    }
  },
  {
    "פזורה": {
      "coordinates": {
        "latitude": 31.16334,
        "longitude": 34.82152
      }
    }
  },
  {
    "ב''ש נאות חובב": {
      "coordinates": {
        "latitude": 31.22131,
        "longitude": 34.77458
      }
    }
  },
  {
    "באר שבע": {
      "coordinates": {
        "latitude": 31.25674,
        "longitude": 34.78132
      }
    }
  },
  {
    "אתר השמן": {
      "coordinates": {
        "latitude": 31.14502,
        "longitude": 34.82837
      }
    }
  },
  {
    "זיקים": {
      "coordinates": {
        "latitude": 31.612086,
        "longitude": 34.521029
      }
    }
  },
  {
    "ניר גלים 2": {
      "coordinates": {
        "latitude": 0,
        "longitude": 0
      }
    }
  },
  {
    "אגן כימיקלים": {
      "coordinates": {
        "latitude": 0,
        "longitude": 0
      }
    }
  },
  {
    "שדרות": {
      "coordinates": {
        "latitude": 31.52796,
        "longitude": 34.60161
      }
    }
  },
  {
    "שדה יואב": {
      "coordinates": {
        "latitude": 31.64571,
        "longitude": 34.67402
      }
    }
  },
  {
    "רובע טו": {
      "coordinates": {
        "latitude": 31.77196,
        "longitude": 34.62715
      }
    }
  },
  {
    "רובע ו": {
      "coordinates": {
        "latitude": 31.793482,
        "longitude": 34.654452
      }
    }
  },
  {
    "קריית גת": {
      "coordinates": {
        "latitude": 31.60633,
        "longitude": 34.7607
      }
    }
  },
  {
    "ק.מלאכי": {
      "coordinates": {
        "latitude": 31.72793,
        "longitude": 34.74035
      }
    }
  },
  {
    "ק.גברעם": {
      "coordinates": {
        "latitude": 31.58932,
        "longitude": 34.60969
      }
    }
  },
  {
    "ניר גלים 1": {
      "coordinates": {
        "latitude": 31.82652,
        "longitude": 34.68428
      }
    }
  },
  {
    "ניר ישראל": {
      "coordinates": {
        "latitude": 31.6861,
        "longitude": 34.63618
      }
    }
  },
  {
    "מבקיעים": {
      "coordinates": {
        "latitude": 31.62213,
        "longitude": 34.57757
      }
    }
  },
  {
    "לוזית": {
      "coordinates": {
        "latitude": 31.68466,
        "longitude": 34.88179
      }
    }
  },
  {
    "כרמיה אשק": {
      "coordinates": {
        "latitude": 31.60403,
        "longitude": 34.54211
      }
    }
  },
  {
    "כפר מנחם": {
      "coordinates": {
        "latitude": 31.72868,
        "longitude": 34.83267
      }
    }
  },
  {
    "יד בנימין": {
      "coordinates": {
        "latitude": 31.8023,
        "longitude": 34.82086
      }
    }
  },
  {
    "יהלום": {
      "coordinates": {
        "latitude": 31.81162,
        "longitude": 34.64339
      }
    }
  },
  {
    "יבנה עיר": {
      "coordinates": {
        "latitude": 31.8764,
        "longitude": 34.739
      }
    }
  },
  {
    "חבל יבנה": {
      "coordinates": {
        "latitude": 31.81881,
        "longitude": 34.72049
      }
    }
  },
  {
    "דליה": {
      "coordinates": {
        "latitude": 0,
        "longitude": 0
      }
    }
  },
  {
    "גן יבנה": {
      "coordinates": {
        "latitude": 31.78286,
        "longitude": 34.7062
      }
    }
  },
  {
    "גן דרום": {
      "coordinates": {
        "latitude": 31.80554,
        "longitude": 34.70229
      }
    }
  },
  {
    "גדרה": {
      "coordinates": {
        "latitude": 31.81355,
        "longitude": 34.77814
      }
    }
  },
  {
    "בת הדר": {
      "coordinates": {
        "latitude": 31.6472,
        "longitude": 34.5965
      }
    }
  },
  {
    "בני דרום": {
      "coordinates": {
        "latitude": 31.81942,
        "longitude": 34.69346
      }
    }
  },
  {
    "אשקלון דרום": {
      "coordinates": {
        "latitude": 31.65374,
        "longitude": 34.55075
      }
    }
  },
  {
    "אשקלון": {
      "coordinates": {
        "latitude": 31.6595,
        "longitude": 34.56975
      }
    }
  },
  {
    "אשדוד-איגוד": {
      "coordinates": {
        "latitude": 31.81847,
        "longitude": 34.66911
      }
    }
  },
  {
    "ארז": {
      "coordinates": {
        "latitude": 31.56193,
        "longitude": 34.56336
      }
    }
  },
  {
    "אורט": {
      "coordinates": {
        "latitude": 31.81461,
        "longitude": 34.64737
      }
    }
  },
  {
    "נאות הכיכר": {
      "coordinates": {
        "latitude": 30.94553,
        "longitude": 35.3884
      }
    }
  },
  {
    "לוט": {
      "coordinates": {
        "latitude": 31.06917,
        "longitude": 35.39764
      }
    }
  },
  {
    "גוש עציון": {
      "coordinates": {
        "latitude": 31.65647,
        "longitude": 35.11681
      }
    }
  },
  {
    "אשלים": {
      "coordinates": {
        "latitude": 31.01532,
        "longitude": 35.35331
      }
    }
  },
  {
    "תחנה מרכזית ירושלים": {
      "coordinates": {
        "latitude": 31.789032,
        "longitude": 35.202641
      }
    }
  },
  {
    "עטרות א.תעשיה": {
      "coordinates": {
        "latitude": 31.8534034,
        "longitude": 35.2152478
      }
    }
  },
  {
    "ספרא": {
      "coordinates": {
        "latitude": 31.7801,
        "longitude": 35.22393
      }
    }
  },
  {
    "1 נווה אילן": {
      "coordinates": {
        "latitude": 31.805885,
        "longitude": 35.078316
      }
    }
  },
  {
    "ניידת התחנה המרכזית בירושלים": {
      "coordinates": {
        "latitude": 31.788745,
        "longitude": 35.202566
      }
    }
  },
  {
    "כביש 1 מוצא": {
      "coordinates": {
        "latitude": 31.796656,
        "longitude": 35.155007
      }
    }
  },
  {
    "כביש 1-מבשרת": {
      "coordinates": {
        "latitude": 31.798176,
        "longitude": 35.139121
      }
    }
  },
  {
    "כביש 1-ק.יערים": {
      "coordinates": {
        "latitude": 31.801673,
        "longitude": 35.098936
      }
    }
  },
  {
    "טבע י-ם": {
      "coordinates": {
        "latitude": 0,
        "longitude": 0
      }
    }
  },
  {
    "גבעת שאול": {
      "coordinates": {
        "latitude": 0,
        "longitude": 0
      }
    }
  },
  {
    "בר אילן -י''ם": {
      "coordinates": {
        "latitude": 31.79445,
        "longitude": 35.21997
      }
    }
  },
  {
    "אפרתה -י''ם": {
      "coordinates": {
        "latitude": 31.75709,
        "longitude": 35.21741
      }
    }
  },
  {
    "16_Jerusalem": {
      "coordinates": {
        "latitude": 31.765407,
        "longitude": 35.190132
      }
    }
  },
  {
    "תורן רמת השרון": {
      "coordinates": {
        "latitude": 32.13086,
        "longitude": 34.83267
      }
    }
  },
  {
    "שכון ל": {
      "coordinates": {
        "latitude": 32.10791,
        "longitude": 34.7895
      }
    }
  },
  {
    "שיכון בבלי": {
      "coordinates": {
        "latitude": 32.10162,
        "longitude": 34.7955
      }
    }
  },
  {
    "רמת השרון": {
      "coordinates": {
        "latitude": 32.131722,
        "longitude": 34.831939
      }
    }
  },
  {
    "רמז": {
      "coordinates": {
        "latitude": 32.09135,
        "longitude": 34.82599
      }
    }
  },
  {
    "ראשון לציון": {
      "coordinates": {
        "latitude": 31.958015,
        "longitude": 34.801995
      }
    }
  },
  {
    "עמיאל": {
      "coordinates": {
        "latitude": 32.04701,
        "longitude": 34.79258
      }
    }
  },
  {
    "עירוני ד": {
      "coordinates": {
        "latitude": 32.09338,
        "longitude": 34.79013
      }
    }
  },
  {
    "תחנה מרכזית תל אביב": {
      "coordinates": {
        "latitude": 32.05602,
        "longitude": 34.77903
      }
    }
  },
  {
    "מכבי אש ר''ג": {
      "coordinates": {
        "latitude": 32.06755,
        "longitude": 34.83215
      }
    }
  },
  {
    "כביש 4": {
      "coordinates": {
        "latitude": 32.06999,
        "longitude": 34.841
      }
    }
  },
  {
    "יד לבנים": {
      "coordinates": {
        "latitude": 32.07553,
        "longitude": 34.82073
      }
    }
  },
  {
    "יד אבנר": {
      "coordinates": {
        "latitude": 32.119,
        "longitude": 34.8025
      }
    }
  },
  {
    "חולון": {
      "coordinates": {
        "latitude": 32.01779,
        "longitude": 34.76814
      }
    }
  },
  {
    "דרך פ''ת": {
      "coordinates": {
        "latitude": 32.06181,
        "longitude": 34.77656
      }
    }
  },
  {
    "ביצרון": {
      "coordinates": {
        "latitude": 32.06645,
        "longitude": 34.79488
      }
    }
  },
  {
    "אנטוקולסקי": {
      "coordinates": {
        "latitude": 32.08386,
        "longitude": 34.78191
      }
    }
  },
  {
    "אחד העם": {
      "coordinates": {
        "latitude": 32.0994,
        "longitude": 34.871
      }
    }
  },
  {
    "רחובות": {
      "coordinates": {
        "latitude": 31.89912,
        "longitude": 34.81562
      }
    }
  },
  {
    "מודיעין חח\"י": {
      "coordinates": {
        "latitude": 31.8929,
        "longitude": 34.9954
      }
    }
  },
  {
    "מודיעין": {
      "coordinates": {
        "latitude": 31.90824,
        "longitude": 35.00921
      }
    }
  },
  {
    "כרמי יוסף": {
      "coordinates": {
        "latitude": 31.8466,
        "longitude": 34.91946
      }
    }
  },
  {
    "יד רמבם 2": {
      "coordinates": {
        "latitude": 31.903919,
        "longitude": 34.896092
      }
    }
  },
  {
    "בני עטרות": {
      "coordinates": {
        "latitude": 32.024722,
        "longitude": 34.911755
      }
    }
  },
  {
    "בית חשמונאי": {
      "coordinates": {
        "latitude": 31.889426,
        "longitude": 34.915092
      }
    }
  },
  {
    "בית שמש": {
      "coordinates": {
        "latitude": 31.75016,
        "longitude": 34.99278
      }
    }
  },
  {
    "אחיסמך": {
      "coordinates": {
        "latitude": 31.9346,
        "longitude": 34.90809
      }
    }
  },
  {
    "אריאל": {
      "coordinates": {
        "latitude": 32.10348,
        "longitude": 35.16779
      }
    }
  },
  {
    "כפר סבא": {
      "coordinates": {
        "latitude": 32.177124,
        "longitude": 34.935725
      }
    }
  },
  {
    "שפיה": {
      "coordinates": {
        "latitude": 32.583126,
        "longitude": 34.969768
      }
    }
  },
  {
    "רעננה": {
      "coordinates": {
        "latitude": 32.1787,
        "longitude": 34.88111
      }
    }
  },
  {
    "קיסריה": {
      "coordinates": {
        "latitude": 32.49854,
        "longitude": 34.9342
      }
    }
  },
  {
    "עמיקם": {
      "coordinates": {
        "latitude": 32.56566,
        "longitude": 35.01997
      }
    }
  },
  {
    "מנשה": {
      "coordinates": {
        "latitude": 32.47079,
        "longitude": 34.9223
      }
    }
  },
  {
    "מגל": {
      "coordinates": {
        "latitude": 32.38623,
        "longitude": 35.03309
      }
    }
  },
  {
    "פ.חנה": {
      "coordinates": {
        "latitude": 32.46637,
        "longitude": 34.96273
      }
    }
  },
  {
    "כ.מהרל": {
      "coordinates": {
        "latitude": 32.64946,
        "longitude": 34.98675
      }
    }
  },
  {
    "חפציבה": {
      "coordinates": {
        "latitude": 32.45944,
        "longitude": 34.89895
      }
    }
  },
  {
    "חדרה": {
      "coordinates": {
        "latitude": 32.44732,
        "longitude": 34.91173
      }
    }
  },
  {
    "זכרון יעקב": {
      "coordinates": {
        "latitude": 32.57204,
        "longitude": 34.95371
      }
    }
  },
  {
    "המעפיל": {
      "coordinates": {
        "latitude": 32.37261,
        "longitude": 34.97679
      }
    }
  },
  {
    "ד.א.כרמל": {
      "coordinates": {
        "latitude": 32.68114,
        "longitude": 35.06984
      }
    }
  },
  {
    "גן שמואל": {
      "coordinates": {
        "latitude": 32.44111,
        "longitude": 34.96067
      }
    }
  },
  {
    "ג.עדה": {
      "coordinates": {
        "latitude": 32.51784,
        "longitude": 35.00304
      }
    }
  },
  {
    "ברקאי": {
      "coordinates": {
        "latitude": 32.47548,
        "longitude": 35.02228
      }
    }
  },
  {
    "ברטעה": {
      "coordinates": {
        "latitude": 32.47699,
        "longitude": 35.086
      }
    }
  },
  {
    "ב.אליעזר": {
      "coordinates": {
        "latitude": 32.43385,
        "longitude": 34.93836
      }
    }
  },
  {
    "אליקים": {
      "coordinates": {
        "latitude": 32.63244,
        "longitude": 35.06565
      }
    }
  },
  {
    "אליכין": {
      "coordinates": {
        "latitude": 32.40856,
        "longitude": 34.91824
      }
    }
  },
  {
    "אורות רבין": {
      "coordinates": {
        "latitude": 0,
        "longitude": 0
      }
    }
  },
  {
    "אום אל קוטוף": {
      "coordinates": {
        "latitude": 32.47417,
        "longitude": 35.05766
      }
    }
  },
  {
    "א.א.פחם": {
      "coordinates": {
        "latitude": 32.53512,
        "longitude": 35.1499
      }
    }
  },
  {
    "עפולה": {
      "coordinates": {
        "latitude": 32.6033,
        "longitude": 35.29097
      }
    }
  },
  {
    "עין דור": {
      "coordinates": {
        "latitude": 32.65363,
        "longitude": 35.41288
      }
    }
  },
  {
    "דברת": {
      "coordinates": {
        "latitude": 32.64408,
        "longitude": 35.35174
      }
    }
  },
  {
    "גבעת המורה": {
      "coordinates": {
        "latitude": 32.61917,
        "longitude": 35.35412
      }
    }
  },
  {
    "ק.מוצקין בגין": {
      "coordinates": {
        "latitude": 32.854514,
        "longitude": 35.091182
      }
    }
  },
  {
    "שפרינצק": {
      "coordinates": {
        "latitude": 32.8226,
        "longitude": 34.9651
      }
    }
  },
  {
    "רוממה": {
      "coordinates": {
        "latitude": 32.78943,
        "longitude": 35.00168
      }
    }
  },
  {
    "קרית חיים-רגבים": {
      "coordinates": {
        "latitude": 32.831263,
        "longitude": 35.054671
      }
    }
  },
  {
    "ק.ים": {
      "coordinates": {
        "latitude": 32.85182,
        "longitude": 35.07873
      }
    }
  },
  {
    "ק.טבעון": {
      "coordinates": {
        "latitude": 32.7218,
        "longitude": 35.1294
      }
    }
  },
  {
    "ק.בנימין": {
      "coordinates": {
        "latitude": 32.78866,
        "longitude": 35.08511
      }
    }
  },
  {
    "ק.ביאליק-עופרים": {
      "coordinates": {
        "latitude": 32.814143,
        "longitude": 35.077715
      }
    }
  },
  {
    "ק.אתא": {
      "coordinates": {
        "latitude": 32.81148,
        "longitude": 35.1123
      }
    }
  },
  {
    "פארק הכרמל": {
      "coordinates": {
        "latitude": 32.73827,
        "longitude": 35.03613
      }
    }
  },
  {
    "עצמאות חיפה": {
      "coordinates": {
        "latitude": 32.81644,
        "longitude": 35.00167
      }
    }
  },
  {
    "נשר": {
      "coordinates": {
        "latitude": 32.76994,
        "longitude": 35.04226
      }
    }
  },
  {
    "ניידת חיפה": {
      "coordinates": {
        "latitude": 32.856675,
        "longitude": 35.091557
      }
    }
  },
  {
    "נוה יוסף": {
      "coordinates": {
        "latitude": 32.791929,
        "longitude": 35.02111
      }
    }
  },
  {
    "נ.שאנן": {
      "coordinates": {
        "latitude": 32.78685,
        "longitude": 35.02026
      }
    }
  },
  {
    "כרמליה": {
      "coordinates": {
        "latitude": 32.79695,
        "longitude": 34.97059
      }
    }
  },
  {
    "כ.חסידים": {
      "coordinates": {
        "latitude": 32.74263,
        "longitude": 35.09444
      }
    }
  },
  {
    "יזרעאליה": {
      "coordinates": {
        "latitude": 32.78981,
        "longitude": 35.00926
      }
    }
  },
  {
    "חוגים": {
      "coordinates": {
        "latitude": 32.80078,
        "longitude": 34.99066
      }
    }
  },
  {
    "ד.עכו - ק.מוצקין": {
      "coordinates": {
        "latitude": 32.829758,
        "longitude": 35.08025
      }
    }
  },
  {
    "חיפה-איגוד": {
      "coordinates": {
        "latitude": 32.789,
        "longitude": 35.03992
      }
    }
  },
  {
    "אחוזה": {
      "coordinates": {
        "latitude": 32.78562,
        "longitude": 34.98535
      }
    }
  },
  {
    "כפר מסריק 2": {
      "coordinates": {
        "latitude": 32.88966,
        "longitude": 35.09703
      }
    }
  },
  {
    "גליל מערבי": {
      "coordinates": {
        "latitude": 32.91575,
        "longitude": 35.29302
      }
    }
  }
];
/* eslint-enable */
