/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the South Australia data sources.
 */

'use strict';
import flatten from 'lodash/flatten.js';
import { acceptableParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';
import Parser from 'rss-parser'
import { parse } from 'node-html-parser';
import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });

function convertUnits(input) {
    return input;
  }

/**
 * Fetches the data for a given source and returns an appropriate object
  * @param {object} source A valid source object
  * @param {function} cb A callback of the form cb(err, data)
  */
 
let parser = new Parser();
// fetchData(path)
 

export const name = 'au_sa'

const path = "https://www.epa.sa.gov.au/air_quality/rss"

export async function fetchData (source, cb) {
  try {

    let parsedRss = await getMeasurements(path);
    let data = await formatData(parsedRss);

    if (data === undefined) {
        return cb({ message: 'Failure to parse data.' });
      }

    return cb(null, data);

    } 
    catch (error) {
        return cb(error);
    }
}

async function getMeasurements(path) {
    const feed = await parser.parseURL(path);

    if (feed.status !== 'ok') {
        console.log('Something went wrong, failed to resolve feed.');
    }

    const sites = new Set();
  
    feed.items.forEach((item) => {
      const root = parse(item.content);
      const head = root.querySelector('thead'); 
      const keys = head.childNodes[0].childNodes.map((o) => o.text); 
      const tbody = root.querySelector('tbody');
      const rows = tbody.childNodes;
      for (const row of rows) {
        const cells = row.childNodes;
        const site = Object.assign(
          ...keys.map((k, i) => ({ [k]: cells[i].text }))
        );
        sites.add(site);
      }
    });
  
    let uniqueSites = [...sites];
    uniqueSites.forEach((site) => {
      site.time = DateTime.fromFormat(site['Date/time'], 'yyyy-MM-dd HH:mm:ss', { zone: 'Australia/Adelaide' });
    });
  
    uniqueSites = getLatestEntries(uniqueSites);
  
    return uniqueSites;
}
  
async function getLatestEntries(sites) {
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
    try {
        data.forEach(site => {
            const location = locations.find(location => location.label === site.Site);
            if (location) {
                site.lat = location.lat;
                site.lng = location.lng;
            }
            Object.keys(site).forEach(key => {
                const newKey = correctParam(key);
                if (newKey !== key) {
                  site[newKey] = site[key];
                  delete site[key];
                }
              });
            // console.log(site)
        });
        
        let filteredData = [];

        data.forEach(obj => {
        acceptableParameters.forEach(param => {
            filteredData.push({ 
                location: obj.Site,
                city: obj.Region,

                parameter: param,
                value: obj.hasOwnProperty(param) ? parseFloat(obj[param]) : null,
                unit: "µg/m³",
                date: {
                    utc: obj.time.toUTC().toISO({suppressMilliseconds: true}),
                    local: obj.time.toISO({suppressMilliseconds: true})
                },
                coordinates: {
                    latitude: obj.lat,
                    longitude: obj.lng
                },
                attribution: [
                    {
                    name: "Department of Environment",
                    url: "https://www.data.gov.cy/dataset/%CF%84%CF%81%CE%AD%CF%87%CE%BF%CF%85%CF%83%CE%B5%CF%82-%CE%BC%CE%B5%CF%84%CF%81%CE%AE%CF%83%CE%B5%CE%B9%CF%82-%CE%B1%CF%84%CE%BC%CE%BF%CF%83%CF%86%CE%B1%CE%B9%CF%81%CE%B9%CE%BA%CF%8E%CE%BD-%CF%81%CF%8D%CF%80%CF%89%CE%BD-api" 
                    }
                ],
                averagingPeriod: {
                    unit: "hours",
                    value: 1
                }                
            });
        });
        });
        let measurements = filteredData.filter(obj => obj.value !== null && !isNaN(obj.value));
        console.log(measurements);
        return {name: 'unused', measurements: flatten(measurements) }
        // return Object.values(data);
    } catch (error) {
        throw error;
    }
}

// fetchData(path)
//   .then((measurements) => {
//     console.log(measurements);
//   })
//   .catch((error) => {
//     console.error(error);
//   });

function correctParam(name) {
    switch (name) {
        case 'Sulfur dioxide (SO2) 1Hr':
            return 'so2';
        case 'Particles (PM10) 1Hr':
            return 'pm10';
        case 'Ozone (O3) 1Hr':
            return 'o3';
        case 'Nitrogen dioxide (NO2) 1Hr':
            return 'no2';
        case 'NOx':
            return 'nox';    
        case 'Carbon monoxide (CO) 8Hr':
            return 'co';
        case 'Particles (PM2.5) 1Hr':
            return 'pm25';
        case 'NO':
            return 'no';
        default:
            return name;
        }
  }

  let locations = [
    { 
        "name": "Mt Barker",
        "label": "Wood smoke program",
        "lat": "-35.073352",
        "lng": "138.864943"          
    }, 
    { 
        "name": "Adelaide CBD",
        "label": "CBD", 
        "lat": "-34.928853",
        "lng": "138.600943"         
    },
    {
        "name": "Le Fevre 1 Birkenhead",
        "label": "Birkenhead",
        "lat": "-34.838654",
        "lng": "138.496351"
    },
    {
        "name": "Le Fevre 2 North Haven",
        "label": "North Haven", 
        "lat": "-34.791288", 
        "lng": "138.497860",
    }, 
    {
        "name": "Netley",
        "label": "Netley", 
        "lat": "-34.9438",
        "lng": "138.5491"
    }, 
    {
        "name": "Northfield", 
        "label": "Northfield",
        "lat": "-34.862004",
        "lng": "138.622932"
    },
    {
        "name": "Elizabeth",
        "label": "Elizabeth",
        "lat": "-34.698472",
        "lng": "138.695751"
    }, 
    { 
        "name": "Christies",
        "label": "Christies",
        "lat": "-35.134927",
        "lng": "138.495159"      
    }, 
    {
        "name": "Port Pirie Oliver St",
        "label": "Oliver St",
        "lat": "-33.194818",
        "lng": "138.020014"
    },
    {
        "name": "Whyalla Schulz Res",
        "label": "Schulz Reserve",
        "lat": "-33.023595", 
        "lng": "137.533239"
    }, 
    { 
        "name": "Whyalla Walls St",
        "label": "Walls St",
        "lat": "-33.036096",
        "lng": "137.586088"
    }
];

    