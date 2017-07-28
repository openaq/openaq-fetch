'use strict';

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import { flattenDeep, isFinite } from 'lodash';
import { parallel } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';

export const name = 'envista_za';

export function fetchData (source, cb) {
  let menuSiteUrl = source.url + 'MenuSite.aspx';
  request(menuSiteUrl, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    let tasks = [];
    let cityLinks = body.match(/DynamicTable.aspx\?G_ID=(\d*)/g);
    while (cityLinks.length > 0) {
      let link = source.url + cityLinks.pop();
      tasks.push(handleCity(source.url, link));
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

const handleCity = function (sourceUrl, link) {
  return function (done) {
    request(link, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      let tasks = [];
      let stationIds = body.match(/StationInfo.aspx\?ST_ID=(\d*)/g);
      while (stationIds.length > 0) {
        let link = sourceUrl + stationIds.pop();
        link = link.replace('StationInfo', 'StationReportFast');
        tasks.push(handleStation(sourceUrl, link));
      }

      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

const handleStation = function (sourceUrl, link) {
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
      form['BasicDatePicker1$textBox'] = $('#BasicDatePicker1_textBox').attr('value');
      form['txtStartTime'] = '00:00';
      form['txtStartTime_p'] = $('#txtStartTime_p').attr('value');
      form['BasicDatePicker2$textBox'] = $('#BasicDatePicker2_textBox').attr('value');
      form['txtEndTime'] = '00:00';
      form['txtEndTime_p'] = $('#txtEndTime_p').attr('value');
      form['ddlAvgType'] = 'AVG';
      form['ddlTimeBase'] = 15;
      form['btnGenerateReport'] = 'GenerateReport';

      const j = request.jar();
      const tasks = [queryStation(sourceUrl, link, form, j)];
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

const queryStation = function (sourceUrl, link, qform, jar) {
  return function (done) {
    request.post({
      url: link,
      form: qform,
      followAllRedirects: true,
      jar: jar
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      const $ = cheerio.load(body);
      // replicate the export form
      let form = {};
      form['__EVENTTARGET'] = '';
      form['__EVENTARGUMENT'] = '';
      form['__VIEWSTATE'] = $('#__VIEWSTATE').attr('value');
      form['__EVENTVALIDATION'] = $('#__EVENTVALIDATION').attr('value');
      form['EnvitechGrid1$XMLExport'] = 'XML';
      form['EnvitechGrid1$_tSearch'] = 'Search+Here';

      let exportLink = $('#form1').attr('action');
      exportLink = sourceUrl + exportLink;
      const tasks = [exportStationXML(exportLink, form)];
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

const exportStationXML = function (link, form) {
  return function (done) {
    request.post({
      url: link,
      form: form
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      formatData(body, (measurements) => {
        return done(null, measurements);
      });
    });
  };
};

const formatData = function (data, cb) {
  const $ = cheerio.load(data, { xmlMode: true });

  const location = $('data').eq(0).attr('value').split(':')[1].trim();
  let base = {
    location: location,
    averagingPeriod: {unit: 'hours', value: 0.25},
    attribution: [{
      name: 'Richards Bay Clean Air Association',
      url: 'http://rbcaa.org.za/'
    }]
  };
  base = Object.assign(base, coordinates[location]);

  let rFullDate = /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})/;
  let measurements = [];
  $('data').filter(function (i, el) {
    return rFullDate.test($(this).attr('value'));
  }).each(function (i, el) {
    let dateM = rFullDate.exec($(this).attr('value'));
    let dateProp = getDate(dateM[0]);
    let rParamUnit = /(\w*)\[ ([\w\d\/]*)\]/i;
    $(this).find('name').filter(function (i, el) {
      let match = rParamUnit.exec($(this).text());
      if (!match) { return false; }
      return acceptableParameters.indexOf(match[1].toLowerCase()) >= 0;
    }).each(function (i, el) {
      let paramUnitM = rParamUnit.exec($(this).text());
      let m = Object.assign({}, base);
      m.date = dateProp;
      m.parameter = paramUnitM[1].toLowerCase();
      m.unit = paramUnitM[2];
      m.value = Number($(this).next().text());
      if (isFinite(m.value)) {
        measurements.push(m);
      }
    });
  });
  return cb(measurements);
};

const getDate = function (s) {
  const date = moment.tz(s, 'DD/MM/YYYY HH:mm', 'Africa/Johannesburg');
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
