'use strict';

/*
   A script to collect coordinates
   for Richards Bay stations
*/

var async = require('async');
var request = require('request');
var cheerio = require('cheerio');

let stationIds = [1, 2, 3, 4, 5, 6, 9, 11, 13, 15, 16];
let baseUrl = 'http://live.rbcaa.org.za/StationDetails.aspx?ST_ID=';

let findTextGetNext = function ($, text) {
  let textNode = $('.TitleLabel').filter(function (i, el) {
    return $(this).text() === text;
  });
  return $(textNode).parent().next().text();
};

let getCoordinates = function (stationId) {
  return function (done) {
    let url = baseUrl + stationId;
    request(url, (err, res, body) => {
      if (err) {
        return console.error(err);
      }

      let $ = cheerio.load(body);
      let stationName = findTextGetNext($, 'Station Name');
      let longitude = findTextGetNext($, 'Longitude');
      let latitude = findTextGetNext($, 'Latitude');
      if (longitude && latitude) {
        return done(null, [stationName, longitude, latitude]);
      } else {
        return done(null, []);
      }
    });
  };
};

let tasks = [];
while (stationIds.length > 0) {
  tasks.push(getCoordinates(stationIds.pop()));
}

async.parallel(tasks, function (err, results) {
  if (err) {
    console.error(err);
  }

  let locations = {};
  while (results.length > 0) {
    let result = results.pop();
    if (!result[0]) {
      continue;
    }
    locations[result[0]] = {
      coordinates: {
        longitude: Number(result[1]),
        latitude: Number(result[2])
      }
    };
  }
  console.log(locations);
});
