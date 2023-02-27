/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Cypriot data sources.
 */

import { removeUnwantedParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';
import fetch from 'node-fetch';

export const name = 'cyprus';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

export async function fetchData (source, cb) {
  try {
    const response = await fetch(source.url);
    let data = await response.json();
    let out = formatData(data);
    return cb(null, out);
  } catch (error) {
    return cb(error);
  }
}

const formatData = (input) => {
    try {
        let time;
        let measurements = [];
        let data = input.data;
        
        Object.values(data).map(o => {
            let station = {
                location: o.name_en,
                city: o.name_el,
                latitude: parseFloat(o.latitude),
                longitude: parseFloat(o.longitude)
            }     

            // the first key in o.pollutants is the datetime for all the measurements of the station
            for (const [key, value] of Object.entries(o.pollutants)) {
                if (key === 'date_time') {

                    time = DateTime.fromFormat(value, 'yyyy-MM-dd HH:mm:ss', { zone: 'Europe/Nicosia' }); // UTC+2
    
                } else {
                    
                    let parameter = correctParam(value.notation)
                    
                    const measurement = {
                        location: station.location,
                        city: station.city,
                        parameter: parameter,
                        value: parseFloat(value.value),
                        unit: "µg/m³", // the unit is always µg/m³ on the website, unavailable in the api
                        date: {
                            utc: time.toUTC().toISO({suppressMilliseconds: true}),
                            local: time.toISO({suppressMilliseconds: true})
                        },
                        coordinates: {
                            latitude: station.latitude,
                            longitude: station.longitude
                        },
                        attribution: [
                            {
                            name: "Republic of Cyprus Department of Labor Inspection",
                            url: "https://www.data.gov.cy/dataset/%CF%84%CF%81%CE%AD%CF%87%CE%BF%CF%85%CF%83%CE%B5%CF%82-%CE%BC%CE%B5%CF%84%CF%81%CE%AE%CF%83%CE%B5%CE%B9%CF%82-%CE%B1%CF%84%CE%BC%CE%BF%CF%83%CF%86%CE%B1%CE%B9%CF%81%CE%B9%CE%BA%CF%8E%CE%BD-%CF%81%CF%8D%CF%80%CF%89%CE%BD-api" 
                            }
                        ],
                        averagingPeriod: {
                            unit: "hours",
                            value: 1
                        }
                    }

                    measurements.push(measurement);
                }
            }
        })

        measurements = removeUnwantedParameters(measurements);
        return {name: 'unused', measurements: measurements}
        
    } catch (error) {
        throw error;
    }
}

function correctParam(name) {
    switch (name) {
        case 'SO₂':
            return 'so2';
        case 'PM₁₀':
            return 'pm10';
        case 'O₃':
            return 'o3';
        case 'NO₂':
            return 'no2';
        case 'NOx':
            return 'nox';    
        case 'CO':
            return 'co';
        case 'PM₂.₅':
            return 'pm25';
        case 'NO':
            return 'no';
        default:
            return name;
        }
  }