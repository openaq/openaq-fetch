'use strict';

import cheerio from 'cheerio';
import { parallelLimit } from 'async';
var request = require('request');

function handleLink (url) {
  return function (done) {
    request(url, (err, res, body) => {
      if (err) {
        done(err);
      }
      let $ = cheerio.load(body);
      let city = $($('#tab_info').find('p').get(5)).html();
      city = city.split('</strong>')[1].trim();
      let coords = $($('#tab_info').find('p').get(8)).html();
      coords = coords.split('</strong>')[1].trim();
      coords = {
        latitude: Number(coords.split(',')[0]),
        longitude: Number(coords.split(',')[1])
      };

      done(null, {city: city, coordinates: coords});
    });
  };
}

request('http://uk-air.defra.gov.uk/latest/currentlevels', (err, res, body) => {
  if (err) {
    return console.error(err);
  }

  // Get links from main page
  console.info('Grabbing main page to get locations.');
  let $ = cheerio.load(body);
  let links = {};
  $('.current_levels_table').each((i, e) => {
    $('tr', $(e)).each((i, e) => {
      let link = $($(e).find('td a')).attr('href');
      let name = $($(e).find('td a')).html();
      if (link) {
        links[name] = handleLink(link.replace('../', 'http://uk-air.defra.gov.uk/'));
      }
    });
  });

  // Get info from each link
  console.info(`Grabbing data for ${Object.keys(links).length} locations.`);
  // links = {'Auchencorth Moss': links['Auchencorth Moss']};
  parallelLimit(links, 5, (err, results) => {
    console.info('Grabbing all data completed!');
    if (err) {
      return console.error(err);
    }

    console.info(results);
  });
});
