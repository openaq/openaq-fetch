'use strict';

const headers = {
  'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:54.0) Gecko/20100101 Firefox/54.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Content-Type': 'text/html; charset=utf-8',
};

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants';
const requestDefault = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const requestJarAndHeaders = baseRequest.defaults({timeout: REQUEST_TIMEOUT, jar: true, headers: headers});
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import { flattenDeep, isFinite } from 'lodash';
import { parallel, parallelLimit, retry } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';

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
    case "ZA":
      return requestDefault;
    case "IL":
      return requestJarAndHeaders;
    default:
      return requestDefault;
    }
}

const handleCity = function (source, link) {
  return function (done) {
    request(source)(link, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      let tasks = [];
      let stationIds = body.match(/StationInfo[5]?.aspx\?ST_ID=(\d*)/g);
      const $ = cheerio.load(body);
      const regionName = $('#lblCaption').text().split('-')[1].trim();
      console.log(stationIds.length);
      while (stationIds.length > 0) {
        let link = source.url + stationIds.pop();
        link = link.replace(/StationInfo[5]?/, 'StationReportFast');
        tasks.push(handleStation(source, link, regionName));
      }

      parallelLimit(tasks, 3, (err, results) => {
        return done(err, results);
      });
    });
  };
};

// station query page
const handleStation = function (source, link, regionName) {
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
      retry({times: 5, interval: 3000}, queryStation(source, link, form, j, regionName), (err, results) => {
        if (err) {
          console.log(err);
          return done(null, []);
        }
        return done(null, results);
      });
    });
  };
};

// do station query
const queryStation = function (source, link, qform, jar, regionName) {
  return function (done) {
    let requestOptions = {
      url: link,
      form: qform,
      followAllRedirects: true
    };
    if (source.country === "ZA") {
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
        console.log(`Error on station query! (${link})`);
        return done(`Error on station query! (${link})`, []);
      }

      if (source.country === "IL") {
        //temp measure
        exportLink = exportLink.replace('./NewGrid', 'NewGrid');
      }

      exportLink = source.url + exportLink;
      retry({times: 5, interval: 3000}, exportStationXML(source, exportLink, form, regionName), (err, results) => {
        if (err) {
          console.log(err);
        }
        return done(err, results);
      });
    });
  };
};

// do export from query result
const exportStationXML = function (source, link, form, regionName) {
  return function (done) {
    request(source).post({
      url: link,
      form: form
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      try {
        formatData(source, body, link, regionName, (measurements) => {
          return done(null, measurements);
        });
      } catch (err) {
        console.log(`Error occured while formatting data from ${link}`);
        return done(`Error in exportStationXML (${link})`, []);
      }
    });
  };
};

const formatData = function (source, data, link, regionName, cb) {
  const $ = cheerio.load(data, { xmlMode: true });
  let location;
  location = $('data').eq(0).attr('value');
  if (source.country === "IL") {
    location = location.split('-')[0].trim();
  } else if (source.country === "ZA") {
    location = location.split(':')[1].trim();
  }
  console.log(location);

  let base = {
    location: location,
    averagingPeriod: {unit: 'hours', value: 0.25},
    attribution: [{
      name: source.organization,
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
    let rParamUnit = /(\w*)\[ ([\w\d\/]*)\]/i;
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

// generated with ../data_scripts/richards-bay.js
const coordinates = {
  Arboretum: { coordinates: { longitude: 32.062646, latitude: -28.752435 } },
  Brackenham: { coordinates: { longitude: 32.038988, latitude: -28.731297 } },
  CBD: { coordinates: { longitude: 32.049242, latitude: -28.756224 } }
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

  if (source.country === "IL") {
    form['BasicDatePicker1$textBox'] = $('#BasicDatePicker1_TextBox').attr('value');
    form['BasicDatePicker2$textBox'] = $('#BasicDatePicker2_TextBox').attr('value');
    form['__VIEWSTATEGENERATOR'] = $('#__VIEWSTATEGENERATOR').attr('value');
    form['btnGenerateReport'] = 'הצג+דוח';
  } else if (source.country === "ZA") {
    form['BasicDatePicker1$textBox'] = $('#BasicDatePicker1_textBox').attr('value');
    form['BasicDatePicker2$textBox'] = $('#BasicDatePicker2_textBox').attr('value');
    form['btnGenerateReport'] = 'GenerateReport';
  }

  return form;
}

const getExportForm = function (source, $) {
  // replicate the export form
  let form = {};

  form['__EVENTARGUMENT'] = '';
  form['__VIEWSTATE'] = $('#__VIEWSTATE').attr('value');
  form['__EVENTVALIDATION'] = $('#__EVENTVALIDATION').attr('value');

  if (source.country === "ZA") {
    form['__EVENTTARGET'] = '';
    form['EnvitechGrid1$XMLExport'] = 'XML';
    //form['EnvitechGrid1$_tSearch'] = 'Search+Here';
  } else if (source.country === "IL") {
    form['__EVENTTARGET'] = 'lnkExport';
    form['__VIEWSTATEGENERATOR'] = $('#__VIEWSTATEGENERATOR').attr('value');
    form['ddlExport'] = 'XML';
    form['lblCurrentPage'] = '1';
  }

  return form;
}
