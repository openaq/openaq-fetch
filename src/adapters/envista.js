'use strict';

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants';
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import { flattenDeep, isFinite } from 'lodash';
import { parallel, parallelLimit, retry } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';

const requestDefault = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const requestJarAndHeaders = baseRequest.defaults({
  timeout: REQUEST_TIMEOUT,
  jar: true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:54.0) Gecko/20100101 Firefox/54.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Content-Type': 'text/html; charset=utf-8'
  }
});

export const name = 'envista';

export function fetchData (source, cb) {
  let menuSiteUrl = source.url + 'MenuSite.aspx';
  request(source)(menuSiteUrl, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    let tasks = [];
    let cityLinks = body.match(/DynamicTable.aspx\?G_ID=(\d*)/g);
    if (!cityLinks) {
      return cb('Unable to match cities', []);
    }
    while (cityLinks.length > 0) {
      let link = source.url + cityLinks.pop();
      tasks.push(handleCity(source, link));
    }

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

const request = function (source) {
  switch (source.country) {
    case 'ZA':
      return requestDefault;
    case 'IL':
      return requestJarAndHeaders;
    default:
      return requestDefault;
  }
};

const handleCity = function (source, link) {
  return function (done) {
    request(source)(link, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      let tasks = [];
      let stationURLs = body.match(/StationInfo[5]?.aspx\?ST_ID=(\d*)/g);
      const $ = cheerio.load(body);
      const regionName = $('#lblCaption').text().split('-')[1].trim();
      while (stationURLs.length > 0) {
        const stationURL = stationURLs.pop();
        const stationID = stationURL.match(/StationInfo5?.aspx\?ST_ID=(\d*)/)[1];
        let link = source.url + stationURL;
        link = link.replace(/StationInfo[5]?/, 'StationReportFast');
        tasks.push(handleStation(source, link, regionName, stationID));
      }

      parallelLimit(tasks, 3, (err, results) => {
        return done(err, results);
      });
    });
  };
};

// station query page
const handleStation = function (source, link, regionName, stationID) {
  return function (done) {
    request(source)(link, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      const $ = cheerio.load(body);
      if (!hasAcceptedParameters($)) {
        return done(null, []);
      }

      const form = getStationForm(source, $);

      const j = request(source).jar();
      retry({times: 5, interval: 3000}, queryStation(source, link, form, j, regionName, stationID), (err, results) => {
        if (err) {
          return done(null, []);
        }
        return done(null, results);
      });
    });
  };
};

// do station query
const queryStation = function (source, link, qform, jar, regionName, stationID) {
  return function (done) {
    let requestOptions = {
      url: link,
      form: qform,
      followAllRedirects: true
    };
    if (source.country === 'ZA') {
      requestOptions.jar = jar;
    }
    request(source).post(requestOptions, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      const $ = cheerio.load(body);

      const form = getExportForm(source, $);

      let exportLink;
      exportLink = $('#form1').attr('action');
      if (!exportLink || (exportLink && exportLink.indexOf('Error.aspx') > -1)) {
        return done(`Error on station query! (${link})`, []);
      }

      if (source.country === 'IL') {
        // temp measure
        exportLink = exportLink.replace('./NewGrid', 'NewGrid');
      }

      exportLink = source.url + exportLink;
      retry({times: 5, interval: 3000}, exportStationXML(source, exportLink, form, regionName, stationID), (err, results) => {
        return done(err, results);
      });
    });
  };
};

// do export from query result
const exportStationXML = function (source, link, form, regionName, stationID) {
  return function (done) {
    request(source).post({
      url: link,
      form: form
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      try {
        formatData(source, body, link, regionName, stationID, (measurements) => {
          return done(null, measurements);
        });
      } catch (err) {
        return done(`Error in exportStationXML (${link})`, []);
      }
    });
  };
};

const formatData = function (source, data, link, regionName, stationID, cb) {
  const $ = cheerio.load(data, { xmlMode: true });
  let location;
  location = $('data').eq(0).attr('value');
  if (source.country === 'IL') {
    location = location.split('-')[0].trim();
  } else if (source.country === 'ZA') {
    location = location.split(':')[1].trim();
  }

  let base = {
    location: location,
    averagingPeriod: {unit: 'hours', value: 0.25},
    attribution: [{
      name: source.organization,
      url: source.url
    }]
  };
  if (source.country === 'IL') {
    base = Object.assign(base, israelCoordinates[stationID]);
  } else if (source.country === 'ZA') {
    base = Object.assign(base, richardsBayCoordinates[location]);
  }

  let rFullDate = /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})/;
  let measurements = [];
  $('data').filter(function (i, el) {
    return rFullDate.test($(this).attr('value'));
  }).each(function (i, el) {
    let dateM = rFullDate.exec($(this).attr('value'));
    let dateProp = getDate(dateM[0], source.timezone);
    let rParamUnit = /(\w*)\[ ([\w\d/]*)\]/i;
    $(this).find('name').filter(function (i, el) {
      let match = rParamUnit.exec($(this).text());
      if (!match) { return false; }
      return acceptableParameters.indexOf(match[1].toLowerCase()) >= 0;
    }).each(function (i, el) {
      const paramUnitM = rParamUnit.exec($(this).text());
      let m = Object.assign({}, base);
      const value = $(this).next().text();
      if (!value) {
        return;
      }
      m.date = dateProp;
      m.parameter = paramUnitM[1].toLowerCase();
      m.unit = paramUnitM[2];
      m.city = regionName;
      m.value = Number(value);
      if (isFinite(m.value)) {
        measurements.push(m);
      }
    });
  });

  // Filter out older measurements to decrease amount getting sent to db
  measurements = measurements.filter((m) => {
    return moment().utc().diff(m.date.utc, 'hours') < 24;
  });

  return cb(measurements);
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

// the forms vary depending on the source version
const getStationForm = function (source, $) {
  let form = {};
  form['__VIEWSTATE'] = $('#__VIEWSTATE').attr('value');
  let lstMonitors = encodeURIComponent(getLstMonitors($));
  // the system kept the / symbol unencoded
  lstMonitors = lstMonitors.replace(/%2F/g, '/');
  form['lstMonitors'] = lstMonitors;
  form['chkall'] = 'on';
  form['RadioButtonList1'] = 0;
  form['RadioButtonList2'] = 0;
  // FIXME
  // the date range is used as is
  // could be customized to get fewer and the newest records
  form['txtStartTime'] = '00:00';
  form['txtStartTime_p'] = '2017-7-17-0-0-0-0';
  form['txtEndTime'] = '00:00';
  form['txtEndTime_p'] = '2017-7-17-0-0-0-0';
  form['ddlAvgType'] = 'AVG';
  form['ddlTimeBase'] = 15;

  if (source.country === 'IL') {
    form['BasicDatePicker1$textBox'] = $('#BasicDatePicker1_TextBox').attr('value');
    form['BasicDatePicker2$textBox'] = $('#BasicDatePicker2_TextBox').attr('value');
    form['__VIEWSTATEGENERATOR'] = $('#__VIEWSTATEGENERATOR').attr('value');
    form['btnGenerateReport'] = 'הצג+דוח';
  } else if (source.country === 'ZA') {
    form['BasicDatePicker1$textBox'] = $('#BasicDatePicker1_textBox').attr('value');
    form['BasicDatePicker2$textBox'] = $('#BasicDatePicker2_textBox').attr('value');
    form['btnGenerateReport'] = 'GenerateReport';
  }

  return form;
};

const getExportForm = function (source, $) {
  // replicate the export form
  let form = {};

  form['__EVENTARGUMENT'] = '';
  form['__VIEWSTATE'] = $('#__VIEWSTATE').attr('value');
  form['__EVENTVALIDATION'] = $('#__EVENTVALIDATION').attr('value');

  if (source.country === 'ZA') {
    form['__EVENTTARGET'] = '';
    form['EnvitechGrid1$XMLExport'] = 'XML';
  } else if (source.country === 'IL') {
    form['__EVENTTARGET'] = 'lnkExport';
    form['__VIEWSTATEGENERATOR'] = $('#__VIEWSTATEGENERATOR').attr('value');
    form['ddlExport'] = 'XML';
    form['lblCurrentPage'] = '1';
  }

  return form;
};

// generated with ../data_scripts/richards-bay.js
const richardsBayCoordinates = {
  Arboretum: { coordinates: { longitude: 32.062646, latitude: -28.752435 } },
  Brackenham: { coordinates: { longitude: 32.038988, latitude: -28.731297 } },
  CBD: { coordinates: { longitude: 32.049242, latitude: -28.756224 } }
};

// generated with ../data_scripts/israel.js
const israelCoordinates = {
  '1': { coordinates: { latitude: 32.6033, longitude: 35.29097 } },
  '2': { coordinates: { latitude: 32.04701, longitude: 34.79258 } },
  '3': { coordinates: { latitude: 32.10348, longitude: 35.16779 } },
  '5': { coordinates: { latitude: 31.79445, longitude: 35.21997 } },
  '6': { coordinates: { latitude: 31.25674, longitude: 34.78132 } },
  '7': { coordinates: { latitude: 31.75016, longitude: 34.99278 } },
  '11': { coordinates: { latitude: 32.91575, longitude: 35.29302 } },
  '13': { coordinates: { latitude: 31.75709, longitude: 35.21741 } },
  '14': { coordinates: { latitude: 29.531533, longitude: 34.941072 } },
  '15': { coordinates: { latitude: 29.531813, longitude: 34.939442 } },
  '16': { coordinates: { latitude: 29.52961, longitude: 34.938219 } },
  '21': { coordinates: { latitude: 31.65647, longitude: 35.11681 } },
  '24': { coordinates: { latitude: 32.01779, longitude: 34.76814 } },
  '26': { coordinates: { latitude: 32.09338, longitude: 34.79013 } },
  '31': { coordinates: { latitude: 31.90824, longitude: 35.00921 } },
  '32': { coordinates: { latitude: 31.89912, longitude: 34.81562 } },
  '33': { coordinates: { latitude: 32.09135, longitude: 34.82599 } },
  '34': { coordinates: { latitude: 32.06999, longitude: 34.841 } },
  '36': { coordinates: { latitude: 31.7801, longitude: 35.22393 } },
  '39': { coordinates: { latitude: 32.119, longitude: 34.8025 } },
  '46': { coordinates: { latitude: 32.100139, longitude: 34.839027 } },
  '47': { coordinates: { latitude: 31.845779, longitude: 34.685015 } },
  '53': { coordinates: { latitude: 32.0994, longitude: 34.871 } },
  '54': { coordinates: { latitude: 32.07553, longitude: 34.82073 } },
  '55': { coordinates: { latitude: 32.10162, longitude: 34.7955 } },
  '56': { coordinates: { latitude: 32.06755, longitude: 34.83215 } },
  '57': { coordinates: { latitude: 32.06645, longitude: 34.79488 } },
  '59': { coordinates: { latitude: 32.08386, longitude: 34.78191 } },
  '60': { coordinates: { latitude: 32.10791, longitude: 34.7895 } },
  '61': { coordinates: { latitude: 31.82652, longitude: 34.68428 } },
  '62': { coordinates: { latitude: 31.793482, longitude: 34.654452 } },
  '63': { coordinates: { latitude: 31.80554, longitude: 34.70229 } },
  '64': { coordinates: { latitude: 31.8929, longitude: 34.9954 } },
  '65': { coordinates: { latitude: 31.8764, longitude: 34.739 } },
  '66': { coordinates: { latitude: 32.45944, longitude: 34.89895 } },
  '69': { coordinates: { latitude: 32.73827, longitude: 35.03613 } },
  '71': { coordinates: { latitude: 31.72868, longitude: 34.83267 } },
  '72': { coordinates: { latitude: 32.64408, longitude: 35.35174 } },
  '73': { coordinates: { latitude: 32.61917, longitude: 35.35412 } },
  '74': { coordinates: { latitude: 31.2193, longitude: 34.80466 } },
  '75': { coordinates: { latitude: 31.14502, longitude: 34.82837 } },
  '76': { coordinates: { latitude: 31.8466, longitude: 34.91946 } },
  '78': { coordinates: { latitude: 31.9346, longitude: 34.90809 } },
  '79': { coordinates: { latitude: 32.13086, longitude: 34.83267 } },
  '80': { coordinates: { latitude: 32.80078, longitude: 34.99066 } },
  '81': { coordinates: { latitude: 31.6472, longitude: 34.5965 } },
  '82': { coordinates: { latitude: 32.06181, longitude: 34.77656 } },
  '83': { coordinates: { latitude: 32.131722, longitude: 34.831939 } },
  '85': { coordinates: { latitude: 31.68466, longitude: 34.88179 } },
  '86': { coordinates: { latitude: 32.78685, longitude: 35.02026 } },
  '87': { coordinates: { latitude: 32.76994, longitude: 35.04226 } },
  '88': { coordinates: { latitude: 32.81148, longitude: 35.1123 } },
  '92': { coordinates: { latitude: 32.85182, longitude: 35.07873 } },
  '93': { coordinates: { latitude: 32.8226, longitude: 34.9651 } },
  '96': { coordinates: { latitude: 32.789, longitude: 35.03992 } },
  '97': { coordinates: { latitude: 32.78866, longitude: 35.08511 } },
  '98': { coordinates: { latitude: 32.74263, longitude: 35.09444 } },
  '99': { coordinates: { latitude: 32.43385, longitude: 34.93836 } },
  '100': { coordinates: { latitude: 32.44732, longitude: 34.91173 } },
  '102': { coordinates: { latitude: 32.63244, longitude: 35.06565 } },
  '103': { coordinates: { latitude: 32.57204, longitude: 34.95371 } },
  '104': { coordinates: { latitude: 32.46637, longitude: 34.96273 } },
  '105': { coordinates: { latitude: 32.40856, longitude: 34.91824 } },
  '106': { coordinates: { latitude: 32.47079, longitude: 34.9223 } },
  '107': { coordinates: { latitude: 32.51784, longitude: 35.00304 } },
  '108': { coordinates: { latitude: 32.44111, longitude: 34.96067 } },
  '109': { coordinates: { latitude: 32.37261, longitude: 34.97679 } },
  '110': { coordinates: { latitude: 32.64946, longitude: 34.98675 } },
  '111': { coordinates: { latitude: 32.68114, longitude: 35.06984 } },
  '112': { coordinates: { latitude: 32.56566, longitude: 35.01997 } },
  '113': { coordinates: { latitude: 32.53512, longitude: 35.1499 } },
  '114': { coordinates: { latitude: 32.38623, longitude: 35.03309 } },
  '115': { coordinates: { latitude: 31.81847, longitude: 34.66911 } },
  '116': { coordinates: { latitude: 31.78286, longitude: 34.7062 } },
  '117': { coordinates: { latitude: 31.81355, longitude: 34.77814 } },
  '118': { coordinates: { latitude: 31.81881, longitude: 34.72049 } },
  '121': { coordinates: { latitude: 31.77196, longitude: 34.62715 } },
  '122': { coordinates: { latitude: 31.8023, longitude: 34.82086 } },
  '123': { coordinates: { latitude: 31.6595, longitude: 34.56975 } },
  '124': { coordinates: { latitude: 31.60633, longitude: 34.7607 } },
  '125': { coordinates: { latitude: 31.72793, longitude: 34.74035 } },
  '126': { coordinates: { latitude: 31.52796, longitude: 34.60161 } },
  '127': { coordinates: { latitude: 31.58932, longitude: 34.60969 } },
  '128': { coordinates: { latitude: 31.64571, longitude: 34.67402 } },
  '129': { coordinates: { latitude: 31.6861, longitude: 34.63618 } },
  '130': { coordinates: { latitude: 31.60403, longitude: 34.54211 } },
  '131': { coordinates: { latitude: 31.56193, longitude: 34.56336 } },
  '132': { coordinates: { latitude: 31.06631, longitude: 34.83676 } },
  '133': { coordinates: { latitude: 31.16334, longitude: 34.82152 } },
  '134': { coordinates: { latitude: 31.19889, longitude: 34.83775 } },
  '135': { coordinates: { latitude: 30.98501, longitude: 34.932 } },
  '136': { coordinates: { latitude: 32.78562, longitude: 34.98535 } },
  '137': { coordinates: { latitude: 32.7218, longitude: 35.1294 } },
  '138': { coordinates: { latitude: 31.22131, longitude: 34.77458 } },
  '139': { coordinates: { latitude: 31.958015, longitude: 34.801995 } },
  '140': { coordinates: { latitude: 32.49854, longitude: 34.9342 } },
  '147': { coordinates: { latitude: 32.65363, longitude: 35.41288 } },
  '154': { coordinates: { latitude: 32.1787, longitude: 34.88111 } },
  '156': { coordinates: { latitude: 31.81461, longitude: 34.64737 } },
  '157': { coordinates: { latitude: 31.81162, longitude: 34.64339 } },
  '158': { coordinates: { latitude: 31.24897, longitude: 35.21597 } },
  '159': { coordinates: { latitude: 32.47548, longitude: 35.02228 } },
  '160': { coordinates: { latitude: 31.65374, longitude: 34.55075 } },
  '182': { coordinates: { latitude: 31.06917, longitude: 35.39764 } },
  '183': { coordinates: { latitude: 31.01532, longitude: 35.35331 } },
  '184': { coordinates: { latitude: 30.94553, longitude: 35.3884 } },
  '189': { coordinates: { latitude: 32.81644, longitude: 35.00167 } },
  '192': { coordinates: { latitude: 32.05602, longitude: 34.77903 } },
  '193': { coordinates: { latitude: 31.789032, longitude: 35.202641 } },
  '300': { coordinates: { latitude: 32.78981, longitude: 35.00926 } },
  '301': { coordinates: { latitude: 32.78943, longitude: 35.00168 } },
  '302': { coordinates: { latitude: 32.791929, longitude: 35.02111 } },
  '303': { coordinates: { latitude: 32.79695, longitude: 34.97059 } },
  '304': { coordinates: { latitude: 29.531814, longitude: 34.939443 } },
  '305': { coordinates: { latitude: 32.46044, longitude: 35.069148 } },
  '306': { coordinates: { latitude: 31.62213, longitude: 34.57757 } },
  '308': { coordinates: { latitude: 32.47699, longitude: 35.086 } },
  '309': { coordinates: { latitude: 32.47417, longitude: 35.05766 } },
  '310': { coordinates: { latitude: 31.788745, longitude: 35.202566 } },
  '321': { coordinates: { latitude: 32.310944, longitude: 34.874947 } },
  '322': { coordinates: { latitude: 32.064336, longitude: 34.772514 } },
  '324': { coordinates: { latitude: 32.831263, longitude: 35.054671 } },
  '326': { coordinates: { latitude: 32.88966, longitude: 35.09703 } },
  '328': { coordinates: { latitude: 31.8534034, longitude: 35.2152478 } },
  '329': { coordinates: { latitude: 31.801673, longitude: 35.098936 } },
  '330': { coordinates: { latitude: 31.765407, longitude: 35.190132 } },
  '332': { coordinates: { latitude: 31.805885, longitude: 35.078316 } },
  '337': { coordinates: { latitude: 32.81101, longitude: 34.998101 } },
  '338': { coordinates: { latitude: 31.903919, longitude: 34.896092 } },
  '339': { coordinates: { latitude: 32.79232, longitude: 35.052037 } },
  '341': { coordinates: { latitude: 32.583126, longitude: 34.969768 } },
  '342': { coordinates: { latitude: 31.796656, longitude: 35.155007 } },
  '343': { coordinates: { latitude: 31.798176, longitude: 35.139121 } },
  '344': { coordinates: { latitude: 32.856675, longitude: 35.091557 } },
  '348': { coordinates: { latitude: 31.987899, longitude: 34.757384 } },
  '354': { coordinates: { latitude: 32.829758, longitude: 35.08025 } },
  '357': { coordinates: { latitude: 32.024722, longitude: 34.911755 } },
  '365': { coordinates: { latitude: 31.81942, longitude: 34.69346 } },
  '367': { coordinates: { latitude: 31.889426, longitude: 34.915092 } },
  '375': { coordinates: { latitude: 32.177124, longitude: 34.935725 } },
  '377': { coordinates: { latitude: 29.554579, longitude: 34.94873 } },
  '379': { coordinates: { latitude: 31.612086, longitude: 34.521029 } },
  '380': { coordinates: { latitude: 32.814143, longitude: 35.077715 } },
  '382': { coordinates: { latitude: 32.854514, longitude: 35.091182 } }
};
