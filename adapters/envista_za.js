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

      // Form inputs
      let form = {};
      form['__VIEWSTATE'] = $('#__VIEWSTATE').attr('value');
      // TODO: try to get lstMonitors dynamically
      form['lstMonitors'] = '%3CWebTree%3E%3CNodes%3E%3ClstMonitors_1%20Checked%3D%22true%22%3E%3C/lstMonitors_1%3E%3ClstMonitors_2%20Checked%3D%22true%22%3E%3C/lstMonitors_2%3E%3ClstMonitors_3%20Checked%3D%22true%22%3E%3C/lstMonitors_3%3E%3ClstMonitors_4%20Checked%3D%22true%22%3E%3C/lstMonitors_4%3E%3ClstMonitors_5%20Checked%3D%22true%22%3E%3C/lstMonitors_5%3E%3ClstMonitors_6%20Checked%3D%22true%22%3E%3C/lstMonitors_6%3E%3ClstMonitors_7%20Checked%3D%22true%22%3E%3C/lstMonitors_7%3E%3ClstMonitors_8%20Checked%3D%22true%22%3E%3C/lstMonitors_8%3E%3ClstMonitors_9%20Checked%3D%22true%22%3E%3C/lstMonitors_9%3E%3ClstMonitors_10%20Checked%3D%22true%22%3E%3C/lstMonitors_10%3E%3ClstMonitors_11%20Checked%3D%22true%22%3E%3C/lstMonitors_11%3E%3ClstMonitors_12%20Checked%3D%22true%22%3E%3C/lstMonitors_12%3E%3ClstMonitors_13%20Checked%3D%22true%22%3E%3C/lstMonitors_13%3E%3ClstMonitors_14%20Checked%3D%22true%22%3E%3C/lstMonitors_14%3E%3ClstMonitors_15%20Checked%3D%22true%22%3E%3C/lstMonitors_15%3E%3ClstMonitors_16%20Checked%3D%22true%22%3E%3C/lstMonitors_16%3E%3ClstMonitors_17%20Checked%3D%22true%22%3E%3C/lstMonitors_17%3E%3ClstMonitors_18%20Checked%3D%22true%22%3E%3C/lstMonitors_18%3E%3ClstMonitors_19%20Checked%3D%22true%22%3E%3C/lstMonitors_19%3E%3ClstMonitors_20%20Checked%3D%22true%22%3E%3C/lstMonitors_20%3E%3C/Nodes%3E%3C/WebTree%3E';
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
  console.log(location + ': ' + measurements.length);
  return cb(measurements);
};

const getDate = function (s) {
  const date = moment.tz(s, 'DD/MM/YYYY HH:mm', 'Africa/Johannesburg');
  return {utc: date.toDate(), local: date.format()};
};

// generated with ../data_scripts/richards-bay.js
const coordinates = {
  Arboretum: { coordinates: { longitude: 32.062646, latitude: -28.752435 } },
  Brackenham: { coordinates: { longitude: 32.038988, latitude: -28.731297 } },
  CBD: { coordinates: { longitude: 32.049242, latitude: -28.756224 } }
};
