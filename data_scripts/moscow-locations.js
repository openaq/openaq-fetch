'use strict';

/*
   A script for getting names and coordinates
   from a KML file at Google Maps.

   It uses the Moscow map,
   but could be adapted for other uses.
*/

var request = require('request');
var cheerio = require('cheerio');

let midValue = '1ve9zrTQE0ONlSkk6tC5qyglpoME';
let kmlURL = 'http://www.google.com/maps/d/kml?forcekml=1&mid=' + midValue;

request(kmlURL, (err, res, body) => {
  if (err) {
    return console.error(err);
  }

  let $ = cheerio.load(body, { xmlMode: true });
  let results = {};
  
  $('Placemark').each(function (index, element) {
    let name = $(this).find('name').text();
    name = name.trim();
    let points = $(this).find('Point coordinates').text();
    points = points.trim();
    results[name] = {
      coordinates: {
        longitude: Number(points.split(',')[0]),
        latitude: Number(points.split(',')[1])
      }
    };
  });
  
  //console.log(results);
  console.log(JSON.stringify(results, null, '\t'));
})