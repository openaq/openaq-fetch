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

// link of lists for each region's site page
const regionPages = (start, end) => [...Array(end - start + 1)].map((_, i) => {
  return 'http://www.svivaaqm.net/' + 'DynamicTable.aspx?G_ID=' + (start + i);
});
let regionPageTasks = regionPages(8, 20);

exports.name = 'israel';
exports.fetchData = (callback) => {
  regionPageTasks.forEach((source, index) => {
    callback(null, handleState(source));
  });
};


/* return data for all stations in each region
 *
 * 1) use handleStation to make list funcs that get data from each station link
 * 2) merge each response into a measurements lists
 * 3) comebine these with each region name
 *
 */
function handleState (source) {
  async.waterfall([
    function (callback) {
      let headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Content-Type': 'text/html; charset=utf-8',
        'Referer': 'http://www.svivaaqm.net/MenuSite.aspx'
      };
      request.get({
        url: source,
        headers: headers
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return callback(err, []);
        }
        let $ = cheerio.load(body);
        // get regoin name from <span> with this id
        const name = $('#lblCaption').text().split('- ')[1];
        // grab all <a></a> elements and get attached links
        const links = $('a');
        let stationLinks = [];
        links.map((a) => {
          stationLinks.push(links[a].attribs.href);
        });
        const stationRequests = handleStation(stationLinks, headers, source);
        callback(null, stationRequests, name);
      });
    },
    function (stationRequests, name, callback) {
      let measurementsFin;
      async.parallel(
        stationRequests,
        (err, results) => {
          if (err) {
            callback(err, []);
          }
          // merge each measurements list into one large list
          measurementsFin = [].concat.apply([], results);
          console.log(measurementsFin);
          callback(null, measurementsFin, name);
        }
      );
    },
    function (measurementsFin, name, callback) {
      const aqObj = {};
      aqObj['name'] = name;
      aqObj['measurements'] = measurementsFin;
      callback(null, aqObj);
    }
  ], (err, result) => {
    if (err) {
      console.log(err);
      return {};
    }
    return result;
  });
}

/* make list of functions to grab data from each region page
 * each of these functsion does the following
 *
 * 1) get links for each of the regions' station pages, then return a measurement list for each station as well as region name
 * 2) merge each station's measurement list into one large list of measurements for entire region
 * 3) generate a final object that meets open-aq standard with region name and measurements
 *
 */
function handleStation (stationLinks, headers, source) {
  return stationLinks
    .filter((link) => { return link !== undefined; })
    .filter((link) => { return link.match(/StationInfo5/); })
    .map((link) => {
      link = 'http://www.svivaaqm.net/' + link;
      return function (callback) {
        headers.Referer = source;
        request.get({
          url: link,
          headers: headers
        }, (err, res, body) => {
          if (err || res.statusCode !== 200) {
            return callback(err, []);
          }
          let $ = cheerio.load(body);
          // get the data table
          let aqData = [];
          // get text from each cell and push it to aqData
          $('table #C1WebGrid1 > tr', 'td').each((i, el) => {
            let data = $(el).children().text().match(/\r\n\t(.*?)\r\n/g);
            data = data.map((dataPoint) => {
              return dataPoint.replace(/\r\n/g, '').replace(/\t/g, '');
            });
            aqData.push(data);
          });
          // get coordinates
          const coords = [];
          // find the 6th + 7th child of table selected.
          // these are longitude & latitude, in that order
          $('div #stationInfoDiv > table').each((i, el) => {
            $(el).children().each((j, element) => {
              if (j === 6 || j === 7) {
                const coord = $(element).html()
                  .split('"value">')[1]
                  .split('<')[0];
                coords.push(coord);
              }
            });
          });
          // populate measurements array
          const measurements = [];
          // iterate over three equal lenght lists in aqData
          // doing so, genereate the objects within a measurements lists
          if (aqData[0].length > 0) {
            aqData[0].forEach((val, index) => {
              // ignore the first element, it holds the title and date.
              if (index > 0) {
                const pollutant = aqData[0][index];
                // only create objs when the pollutent one tracked by openAQ
                if (_.includes(['SO2', 'PM10', 'PM2.5', 'No2', 'O3'], pollutant)) {
                  const value = aqData[2][index];
                  // further, only create the object if the measurement is not NaN, or nothing
                  if (!(isNaN(parseInt(value)))) {
                    // make date in Jerusalem time.
                    const time = moment.tz(
                      aqData[2][0],
                      'DD/MM/YYYY HH:mm:ss',
                      'Asia/Jerusalem'
                    );
                    const measurement = {};
                    measurement['parameter'] = pollutant;
                    measurement['date'] = {
                      utc: time.toDate(),
                      local: time.format()
                    };
                    measurement['coordinates'] = {
                      latitude: coords[1],
                      longitude: coords[0]
                    };
                    measurement['value'] = value;
                    measurement['unit'] = aqData[1][index];
                    measurement['attribution'] = [{
                      name: 'Israel Ministry of Environmental Protection',
                      url: 'http://www.svivaaqm.net/'
                    }];
                    // TODO: use javascript:__doPostBack('lnkStationReport','') found on page to grab this.
                    // this is per success w/Dolugon's method.
                    measurement['averagingPeriod'] = {
                      unit: 'hours',
                      value: 'time'
                    };
                    measurements.push(measurement);
                  }
                }
              }
            });
          }
          callback(null, measurements);
        });
      };
    });
}
