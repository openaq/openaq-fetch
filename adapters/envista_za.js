'use strict';

const headers = {
  'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:54.0) Gecko/20100101 Firefox/54.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Content-Type': 'text/html; charset=utf-8',
};

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT, jar: true, headers: headers});
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import { flattenDeep, isFinite } from 'lodash';
import { parallel } from 'async';
import { acceptableParameters, convertUnits } from '../lib/utils';

export const name = 'envista_za';


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

const handleCity = function (source, link) {
  return function (done) {
    request(link, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      let tasks = [];
      let stationIds = body.match(/StationInfo[5]?.aspx\?ST_ID=(\d*)/g);
      console.log(stationIds.length);
      while (stationIds.length > 0) {
        let link = source.url + stationIds.pop();
        link = link.replace(/StationInfo[5]?/, 'StationReportFast');
        tasks.push(handleStation(source, link));
      }

      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

// station query page
const handleStation = function (source, link) {
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
      // FIXME
      // the date range is used as is
      // could be customized to get fewer and the newest records
      form['BasicDatePicker1$textBox'] = $('#BasicDatePicker1_TextBox').attr('value');
      form['txtStartTime'] = '00:00';
      form['txtStartTime_p'] = '2017-7-17-0-0-0-0';//$('#txtStartTime_p').attr('value');
      form['BasicDatePicker2$textBox'] = $('#BasicDatePicker2_TextBox').attr('value');
      form['txtEndTime'] = '00:00';
      form['txtEndTime_p'] = '2017-7-17-0-0-0-0';//$('#txtEndTime_p').attr('value');
      form['ddlAvgType'] = 'AVG';
      form['ddlTimeBase'] = 15;
      form['btnGenerateReport'] = 'הצג+דוח';

      const j = request.jar();
      const tasks = [queryStation(source, link, form, j)];
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

// do station query
const queryStation = function (source, link, qform, jar) {
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
        //temp measure
        exportLink = exportLink.replace('./NewGrid', 'NewGrid');
      } catch (err) {
        console.log(`Error on getting export link at ${link}`);
        return done(null, []);
      }

      exportLink = source.url + exportLink;
      const tasks = [exportStationXML(source, exportLink, form)];
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  };
};

// do export from query result
const exportStationXML = function (source, link, form) {
  return function (done) {
    request.post({
      url: link,
      form: form
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      formatData(source, body, link, (measurements) => {
        return done(null, measurements);
      });
    });
  };
};

const formatData = function (source, data, link, cb) {
  const $ = cheerio.load(data, { xmlMode: true });
  let location;
  try {
    location = $('data').eq(0).attr('value').split('-')[0].trim();
    console.log(location);
  } catch (err) {
    console.log(`Error occured when exporting from: ${link}`);
    return cb([]);
  }
  let base = {
    location: location,
    averagingPeriod: {unit: 'hours', value: 0.25},
    attribution: [{
      name: 'Israeli Attribution FIXME',
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
