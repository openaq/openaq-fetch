/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the South Australia data sources.
 */

'use strict';

import { acceptableParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';
import Parser from 'rss-parser';
import { parse } from 'node-html-parser';
import log from '../lib/logger.js';

const parser = new Parser();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const name = 'southaustralia';

export async function fetchData(source, cb) {
  try {
    log.debug('Starting fetchData...');
    const parsedRss = await getMeasurements(source.url);
    if (!parsedRss) {
      log.debug('No parsed RSS data received.');
      return cb({ message: 'Failed to parse RSS data.' });
    }
    const data = await formatData(parsedRss);
    if (data === undefined) {
      log.debug('Failed to format data.');
      return cb({ message: 'Failure to parse data.' });
    }
    return cb(null, data);
  } catch (error) {
    log.debug('Error in fetchData:', error);
    return cb(error);
  }
}

async function getMeasurements(path) {
  log.debug('Fetching RSS data from:', path);
  try {
    const feed = await parser.parseURL(path);

    const sites = new Set();
    feed.items.forEach((item) => {
      log.debug('Processing RSS item:', item.title);

      const dateMatch = item.title.match(
        /\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} [ap]m/
      );
      if (!dateMatch) {
        log.debug('Failed to extract date from title:', item.title);
        return;
      }
      const dateStr = dateMatch[0];

      // Extract date components
      const matches = dateStr.match(
        /(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}) ([ap]m)/
      );
      if (!matches) {
        log.debug(
          "Date string doesn't match the expected format:",
          dateStr
        );
        return;
      }

      const [_, day, month, year, hour, minute, ampm] = matches;
      let parsedHour = parseInt(hour, 10);
      if (ampm === 'pm' && parsedHour !== 12) parsedHour += 12;
      if (ampm === 'am' && parsedHour === 12) parsedHour = 0;

      const date = DateTime.fromObject({
        day: parseInt(day, 10),
        month: parseInt(month, 10),
        year: parseInt(year, 10),
        hour: parsedHour,
        minute: parseInt(minute, 10),
      }).setZone('Australia/Adelaide');

      if (!date.isValid) {
        log.debug(
          'Error constructing date:',
          date.invalidExplanation
        );
        return;
      }

      const root = parse(item.content);
      const head = root.querySelector('thead');
      const keys = head.childNodes[0].childNodes.map((o) => o.text);
      log.debug('Parsed keys:', keys);

      const tbody = root.querySelector('tbody');
      const rows = tbody.childNodes;
      for (const row of rows) {
        const cells = row.childNodes;
        const site = Object.assign(
          ...keys.map((k, i) => ({ [k]: cells[i].text }))
        );
        site.time = date; // Assign the parsed date to the site object
        log.debug('Parsed site data:', site);
        sites.add(site);
      }
    });

    let uniqueSites = [...sites];
    uniqueSites = getLatestEntries(uniqueSites);
    log.debug('Fetched and parsed measurements:', uniqueSites);
    return uniqueSites;
  } catch (error) {
    log.debug('Error fetching RSS data:', error);
    return null;
  }
}

async function getLatestEntries(sites) {
  log.debug('Getting latest entries...');
  const latestEntries = sites.reduce((result, site) => {
    const key = site.Site;
    const currentLatest = result[key];
    if (!currentLatest || site.time > currentLatest.time) {
      result[key] = site;
    }
    return result;
  }, {});
  return Object.values(latestEntries);
}

async function formatData(data) {
  log.debug('Formatting data...');
  data.forEach((site) => {
    const location = locations.find(
      (location) => location.label === site.Site
    );
    if (location) {
      site.lat = location.lat;
      site.lng = location.lng;
    } else {
      log.debug(`Location not found for site: ${site.Site}`);
    }
    Object.keys(site).forEach((key) => {
      const newKey = correctParam(key);
      if (newKey !== key) {
        site[newKey] = site[key];
        delete site[key];
      }
    });
  });

  let filteredData = [];
  data.forEach((obj) => {
    acceptableParameters.forEach((param) => {
      filteredData.push({
        location: obj.Site,
        city: obj.Region,
        parameter: param,
        value: obj.hasOwnProperty(param)
          ? parseFloat(obj[param])
          : null,
        unit: param === 'pm10' || param === 'pm25' ? 'µg/m³' : 'ppm',
        date: {
          utc: obj.time.toUTC().toISO({ suppressMilliseconds: true }),
          local: obj.time.toISO({ suppressMilliseconds: true }),
        },
        coordinates: {
          latitude: parseFloat(obj.lat),
          longitude: parseFloat(obj.lng),
        },
        attribution: [
          {
            name: 'South Australia Environmental Protection Authority (EPA)',
            url: 'https://data.sa.gov.au/data/dataset/recent-air-quality',
          },
        ],
        averagingPeriod: {
          unit: 'hours',
          value: param === 'co' ? 8 : 1,
        },
      });
    });
  });
  const measurements = filteredData.filter(
    (obj) => obj.value !== null && !isNaN(obj.value)
  );
  log.debug('Formatted data:', measurements);
  return { name: 'unused', measurements: measurements };
}

function correctParam(name) {
  switch (name) {
    case 'SO2 1 Hour':
      return 'so2';
    case 'PM10 1 Hour':
      return 'pm10';
    case 'O3 1 Hour':
      return 'o3';
    case 'NO2 1 Hour':
      return 'no2';
    case 'NOx':
      return 'nox';
    case 'CO 8 Hours':
      return 'co';
    case 'PM2.5 1 Hour':
      return 'pm25';
    case 'NO':
      return 'no';
    default:
      return name;
  }
}

let locations = [
  {
    name: 'Mt Barker',
    label: 'Wood smoke program',
    lat: '-35.073352',
    lng: '138.864943',
  },
  {
    name: 'Adelaide CBD',
    label: 'CBD',
    lat: '-34.928853',
    lng: '138.600943',
  },
  {
    name: 'Le Fevre 1 Birkenhead',
    label: 'Birkenhead',
    lat: '-34.838654',
    lng: '138.496351',
  },
  {
    name: 'Le Fevre 2 North Haven',
    label: 'North Haven',
    lat: '-34.791288',
    lng: '138.497860',
  },
  {
    name: 'Netley',
    label: 'Netley',
    lat: '-34.9438',
    lng: '138.5491',
  },
  {
    name: 'Northfield',
    label: 'Northfield',
    lat: '-34.862004',
    lng: '138.622932',
  },
  {
    name: 'Elizabeth',
    label: 'Elizabeth',
    lat: '-34.698472',
    lng: '138.695751',
  },
  {
    name: 'Christies',
    label: 'Christies',
    lat: '-35.134927',
    lng: '138.495159',
  },
  {
    name: 'Port Pirie Oliver St',
    label: 'Oliver St',
    lat: '-33.194818',
    lng: '138.020014',
  },
  {
    name: 'Whyalla Schulz Res',
    label: 'Schulz Reserve',
    lat: '-33.023595',
    lng: '137.533239',
  },
  {
    name: 'Whyalla Walls St',
    label: 'Walls St',
    lat: '-33.036096',
    lng: '137.586088',
  },
];
