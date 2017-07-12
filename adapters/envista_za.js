'use strict';

import { default as baseRequest } from 'request';
import { REQUEST_TIMEOUT } from '../lib/constants';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT, jar: true});
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
var Iconv = require('iconv').Iconv;
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

    let tasks = []
    let city_links = body.match(/DynamicTable.aspx\?G_ID=(\d*)/g);
    while (city_links.length > 0) {
      let link = source.url + city_links.pop();
      console.log(link);
      tasks.push(handleCity(source.url, link));
    }

    parallel(tasks, (err, results) => {
      if (err) {
        return cb(err, []);
      }

      // flattenDeep
      // convertUnits

      return cb(err, {name: 'unused', measurements: results});
    });
  });
};

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
        console.log(link);
        tasks.push(handleStation(sourceUrl, link));
      }

      // DEBUG
      tasks = tasks.slice(1, 2)

      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  }
};

const handleStation = function (sourceUrl, link) {
  return function (done) {
    request(link, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }

      const $ = cheerio.load(body);

      // Form inputs
      // some of them might be not required (like txtEndTime_p), try omitting them
      let form = {};
      form['__VIEWSTATE'] = $('input[name=__VIEWSTATE]').attr('value');
      // TODO: try to get lstMonitors dynamically
      form['lstMonitors'] = "%3CWebTree%3E%3CNodes%3E%3ClstMonitors_1%20Checked%3D%22true%22%3E%3C/lstMonitors_1%3E%3ClstMonitors_2%20Checked%3D%22true%22%3E%3C/lstMonitors_2%3E%3ClstMonitors_3%20Checked%3D%22true%22%3E%3C/lstMonitors_3%3E%3ClstMonitors_4%20Checked%3D%22true%22%3E%3C/lstMonitors_4%3E%3ClstMonitors_5%20Checked%3D%22true%22%3E%3C/lstMonitors_5%3E%3ClstMonitors_6%20Checked%3D%22true%22%3E%3C/lstMonitors_6%3E%3ClstMonitors_7%20Checked%3D%22true%22%3E%3C/lstMonitors_7%3E%3ClstMonitors_8%20Checked%3D%22true%22%3E%3C/lstMonitors_8%3E%3ClstMonitors_9%20Checked%3D%22true%22%3E%3C/lstMonitors_9%3E%3ClstMonitors_10%20Checked%3D%22true%22%3E%3C/lstMonitors_10%3E%3ClstMonitors_11%20Checked%3D%22true%22%3E%3C/lstMonitors_11%3E%3ClstMonitors_12%20Checked%3D%22true%22%3E%3C/lstMonitors_12%3E%3ClstMonitors_13%20Checked%3D%22true%22%3E%3C/lstMonitors_13%3E%3ClstMonitors_14%20Checked%3D%22true%22%3E%3C/lstMonitors_14%3E%3ClstMonitors_15%20Checked%3D%22true%22%3E%3C/lstMonitors_15%3E%3ClstMonitors_16%20Checked%3D%22true%22%3E%3C/lstMonitors_16%3E%3ClstMonitors_17%20Checked%3D%22true%22%3E%3C/lstMonitors_17%3E%3ClstMonitors_18%20Checked%3D%22true%22%3E%3C/lstMonitors_18%3E%3ClstMonitors_19%20Checked%3D%22true%22%3E%3C/lstMonitors_19%3E%3ClstMonitors_20%20Checked%3D%22true%22%3E%3C/lstMonitors_20%3E%3C/Nodes%3E%3C/WebTree%3E";
      form['chkall'] = 'on';
      form['RadioButtonList1'] = 0;
      form['RadioButtonList2'] = 3;
      // replace with Now-3h or similar
      form['BasicDatePicker1$textBox'] = '11/07/2017';
      form['txtStartTime'] = '00:00';
      form['txtStartTime_p'] = '2017-7-12-0-0-0-0';
      // replace with Now
      form['BasicDatePicker2$textBox'] = '12/07/2017';
      form['txtEndTime'] = '00:00';
      form['txtEndTime_p'] = '2017-7-12-0-0-0-0';;
      form['ddlAvgType'] = 'AVG';
      form['ddlTimeBase'] = 15;
      form['btnGenerateReport'] = 'GenerateReport';
      form['startIndex'] = 1;

      const tasks = [queryStation(sourceUrl, link, form)];
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  }
};

const queryStation = function(sourceUrl, link, form) {
  return function (done) {
    request.post({
      url: link,
      form: form,
      followAllRedirects: true
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      const $ = cheerio.load(body);
      // replicate the export form
      let form = {};
      form['__EVENTTARGET'] = '';
      form['__EVENTARGUMENT'] = '';
      form['__VIEWSTATE'] = $('input[name=__VIEWSTATE]').attr('value');
      form['__EVENTVALIDATION'] = $('input[name=__EVENTVALIDATION]').attr('value');
      form['EnvitechGrid1$CSVExport'] = 'CSV';
      form['EnvitechGrid1$_tSearch'] = "Search+Here";

      let export_link = $('#form1').attr('action');
      export_link = sourceUrl + export_link;
      const tasks = [exportStationCSV(export_link, form)];
      parallel(tasks, (err, results) => {
        return done(err, results);
      });
    });
  }
};

const exportStationCSV = function (link, form) {
  return function (done) {
    console.log(link, form);
    request.post({
      url: link,
      form: form,
      gzip: true,
      headers: {
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      // TODO: handle body
      console.log(res.headers);
      console.log(res.body);
    });
  }
};

const formatData = function (data, stationId, cb) {
  
};

// generated with ../data_scripts/richards-bay.js
const coordinates = {
  Arboretum: { coordinates: { longitude: 32.062646, latitude: -28.752435 } },
  Brackenham: { coordinates: { longitude: 32.038988, latitude: -28.731297 } },
  CBD: { coordinates: { longitude: 32.049242, latitude: -28.756224 } }
};
