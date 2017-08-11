'use strict';

/*
  script to get coordinates for israel stations.
*/

const headers = {
  'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:54.0) Gecko/20100101 Firefox/54.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Content-Type': 'text/html; charset=utf-8'
};

var async = require('async');
var request = require('request');
var cheerio = require('cheerio');
var _ = require('lodash');

let baseUrl = 'http://www.svivaaqm.net/';

request.get({
  headers: headers,
  url: 'http://www.svivaaqm.net/MenuSite.aspx'
}, (err, res, body) => {
  if (err || res.statusCode !== 200) {
    return;
  }
  let tasks = [];
  let regionLinks = body.match(/DynamicTable.aspx\?G_ID=(\d*)/g);
  while (regionLinks.length > 0) {
    let link = baseUrl + regionLinks.pop();
    tasks.push(getStations(baseUrl, link));
  }
  async.parallel(tasks, (err, results) => {
    if (err) {
      console.log(err);
    }
    results = _.flattenDeep(results);
    results = Object.assign({}, ...results);
    console.log(results);
  });
});

let getStations = function (baseUrl, link) {
  return function (done) {
    request.get({
      headers: headers,
      url: link
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return done(null, []);
      }
      let tasks = [];
      const stationURLs = body.match(/StationInfo5?.aspx\?ST_ID=(\d*)/g);
      while (stationURLs.length > 0) {
        const stationURL = stationURLs.pop();
        const stationID = stationURL.match(/StationInfo5?.aspx\?ST_ID=(\d*)/)[1];
        const link = `${baseUrl}${stationURL}`;
        tasks.push(getCoordinates(link, stationID));
      }
      async.parallel(tasks, (err, results) => {
        if (err) { done(null, []); }
        results = _.flattenDeep(results);
        return done(err, results);
      });
    });
  };
};

let getCoordinates = function (link, stationID) {
  return function (done) {
    request.get({
      url: link,
      headers: headers
    }, (err, res, body) => {
      if (err) {
        return done(null, []);
      }

      let $ = cheerio.load(body);
      const stationData = $('#stationInfoDiv > table').children().toArray().map((tr) => {
        let toReturn = tr.children.find((td) => {
          return td.attribs && td.attribs.class === 'key' && _.includes(['שם תחנה', 'קו אורך', 'קו רוחב'], td.children[0].data);
        });
        if (toReturn !== undefined) {
          return $(toReturn.next).text();
        }
      }).filter((data) => { return data !== undefined; });
      if (stationData.length === 3) {
        if (!(_.includes([stationData[1], stationData[2]], undefined)) || !(_.includes([stationData[1], stationData[2]], 0))) {
          if (Number(stationData[2]) === 0 && Number(stationData[1]) === 0) {
            return done(null, []);
          }
          const stationObj = {};
          stationObj[stationID] = {
            coordinates: {
              latitude: Number(stationData[2]),
              longitude: Number(stationData[1])

            }
          };
          return done(null, [stationObj]);
        }
      } else {
        return done(null, []);
      }
    });
  };
};
