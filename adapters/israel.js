'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import async from 'async';
import lodash  from 'lodash';
const _ = lodash;
import { convertUnits } from '../lib/utils';
import { default as parse } from 'csv-parse/lib/sync';

exports.name = 'israel';
exports.fetchData = (source, cb) => {};

// make list of links to regional pages
var sources = (start, end) => [...Array(end - start + 1)].map((_, i) => {
  return 'http://www.svivaaqm.net/' + 'DynamicTable.aspx?G_ID=' + (start + i);
});
sources = sources(7, 21);
// for each regional link, get all station page links, and return an object
// with functions to get tables for get data from aq monitor page.
function getRegionTables (regionLink, callback) {
  let headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Content-Type': 'text/html; charset=utf-8',
    'Referer': 'http://www.svivaaqm.net/MenuSite.aspx'
  };
  request.get({
    url: regionLink,
    headers: headers
  }, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return callback({message: 'Failure to access data source.'});
    }
    let $ = cheerio.load(body);
    const links = $('a');
    let stationLinks = [];
    links.map((a) => {
      stationLinks.push(links[a].attribs.href);
    });
    let stationRequests = stationLinks
      .filter((link) => { return link !== undefined; })
      .filter((link) => { return link.match(/StationInfo5/); })
      .map((link) => {
        const stID = link.split('ST_ID=')[1];
        const parallelObj = {};
        parallelObj[stID] = function (callback) {
          headers.Referer = regionLink;
          request.get({
            url: link,
            headers: headers
          }, (err, res, body) => {
            if (err || res.statusCode !== 200) {
              return callback({message: 'Failure to access data source.'});
            }
            console.log(body);
          });
        };
        return parallelObj;
      });
    stationRequests = _.reduce(
      stationRequests, (stationRequestObj, stationRequest) => {
        return _.assign(stationRequestObj, stationRequest);
      }, {}
    );
    return stationRequests;
  });
}

getRegionTables('http://www.svivaaqm.net/DynamicTable.aspx?G_ID=8', null)
