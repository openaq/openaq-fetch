import { parallel } from 'async';
import { DateTime } from 'luxon';
import flatten from 'lodash/flatten.js';
import fetch from 'node-fetch';

import { convertUnits } from '../lib/utils.js';
// const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });
// import {parse} from 'wellknown';
// import fetch from 'node-fetch';
// function convertUnits(input) {
//   return input;
// }
/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

//get the unix timestamp for now and 24 hours ago
let now = new Date();
let yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
now = now.getTime()
yesterday = yesterday.getTime()

// console.log(yesterday)
// console.log(now)

// this will be location[n].location to match the station
const locations = "https://airqualitykosova.rks-gov.net/dataservices/chart/AQStations/all?lang=en";
// const ALL_DATA = // would be response[n].items.station
//   `https://airqualitykosova.rks-gov.net/dataservices/chart/stationDataTable?stationsListStr=%5B%7B%22id%22:10%7D,%7B%22id%22:11%7D,%7B%22id%22:4%7D,%7B%22id%22:3%7D,%7B%22id%22:5%7D,%7B%22id%22:6%7D,%7B%22id%22:13%7D,%7B%22id%22:9%7D,%7B%22id%22:12%7D,%7B%22id%22:8%7D,%7B%22id%22:1%7D,%7B%22id%22:2%7D,%7B%22id%22:7%7D%5D&resolution=hour&startTime=${yesterday}&endTime=${now}&parameterListStr=%5B%7B%22id%22:1,%22name%22:%22pm10%22,%22unit%22:%22%C2%B5g/m3%22,%22label%22:%22PM10%22,%22sortOrder%22:1,%22aqReporting%22:true,%22indexed%22:true%7D,%7B%22id%22:2,%22name%22:%22pm25%22,%22unit%22:%22%C2%B5g/m3%22,%22label%22:%22PM2.5%22,%22sortOrder%22:2,%22aqReporting%22:true,%22indexed%22:true%7D,%7B%22id%22:3,%22name%22:%22no2%22,%22unit%22:%22%C2%B5g/m3%22,%22label%22:%22NO2%22,%22sortOrder%22:3,%22aqReporting%22:true,%22indexed%22:true%7D,%7B%22id%22:5,%22name%22:%22o3%22,%22unit%22:%22%C2%B5g/m3%22,%22label%22:%22O3%22,%22sortOrder%22:5,%22aqReporting%22:true,%22indexed%22:true%7D,%7B%22id%22:6,%22name%22:%22so2%22,%22unit%22:%22%C2%B5g/m3%22,%22label%22:%22SO2%22,%22sortOrder%22:6,%22aqReporting%22:true,%22indexed%22:true%7D,%7B%22id%22:7,%22name%22:%22co%22,%22unit%22:%22mg/m3%22,%22label%22:%22CO%22,%22sortOrder%22:7,%22aqReporting%22:true,%22indexed%22:false%7D,%7B%22id%22:8,%22name%22:%22index%22,%22unit%22:%22level%22,%22label%22:%22Index%22,%22sortOrder%22:8,%22aqReporting%22:true,%22indexed%22:false%7D%5D&valueTypeStr=AVG&timeZoneName=Europe/Belgrade&lang=en`;

//this will build the url for the data
let string1 = 'https://airqualitykosova.rks-gov.net/dataservices/chart/stationDataTable?stationsListStr='
let json1 =
    [{"id":10},{"id":11},{"id":4},{"id":3},{"id":5},{"id":6},{"id":13},{"id":9},{"id":12},{"id":8},{"id":1},{"id":2},{"id":7}]
let string2 = `&resolution=hour&startTime=${yesterday}&endTime=${now}&parameterListStr=`  
let json2 =
    [{"id":1,"name":"pm10","unit":" µg/m3","label":"PM10","sortOrder":1,"aqReporting":true,"indexed":true},
    {"id":2,"name":"pm25","unit":" µg/m3","label":"PM2.5","sortOrder":2,"aqReporting":true,"indexed":true},
    {"id":3,"name":"no2","unit":" µg/m3","label":"NO2","sortOrder":3,"aqReporting":true,"indexed":true},
    {"id":5,"name":"o3","unit":" µg/m3","label":"O3","sortOrder":5,"aqReporting":true,"indexed":true},
    {"id":6,"name":"so2","unit":" µg/m3","label":"SO2","sortOrder":6,"aqReporting":true,"indexed":true},
    {"id":7,"name":"co","unit":"mg/m3","label":"CO","sortOrder":7,"aqReporting":true,"indexed":false},
    {"id":8,"name":"index","unit":"level","label":"Index","sortOrder":8,"aqReporting":true,"indexed":false}]
let string3 = '&valueTypeStr=AVG&timeZoneName=Europe/Belgrade&lang=en'

// combine the above in one string and url encode them
const ALL_DATA = string1 + encodeURIComponent(JSON.stringify(json1)) + string2 + encodeURIComponent(JSON.stringify(json2)) + string3

export async function fetchData (source, cb) {
    try {  

        //
        const data = await getData();
        // console.log(data)
        return cb(null, data);
    } catch (error) {
        return cb (error);
    }
}  

const getStations = async () => {
    try {    
        const response = await fetch(locations);
        let data = await response.json();
        return data;
    } catch (error) {
        throw error;
    }
}
//

const getMeasurements = async () => {
    try {
        const response = await fetch(ALL_DATA);
        console.log(response.url)
        let data = await response.json();
        data = data.items;
        data.map(measurement => { 
                // console.log(measurement.time.split(' '))
                let [date, time] = measurement.time.split(' ');
                //apend minutes and seconds to time +1 GMT
                time = time + ':00:00';
                const [year, month, day] = date.split('-');
                const d = DateTime.fromISO(
                    `${year}-${month}-${day}T${time}`,
                    {
                        zone: 'Europe/Belgrade',
                    }
                    );
                measurement.time = d;
            });
        return data;
    } catch (error) {
        throw error;
    }
};


const getData = async () => {
    let format = "yyyy-MM-dd\'T\'HH:mm:ss+hh:mm";
    const stations = await getStations();
    const measurements = await getMeasurements();
    const data = stations.map(station => {
        // //find the last measurement that matches the station.location by time
        const measurement = measurements.filter(measurement => measurement.station === station.location).sort((a, b) => b.time.toISO() - a.time.toISO()).pop();
        return {
            stationName: station.location,
            coordinates: {
                latitude: station.y,
                longitude: station.x
            },
            date: {
                utc: measurement.time.toUTC().toISO(),
                local: measurement.time.toFormat(format)
            },
            values: {
                pm10: measurement.pm10,
                pm25: measurement.pm25,
                so2: measurement.so2,
                no2: measurement.no2,
                co: measurement.co,
                o3: measurement.o3,
            },
            unit: "µg/m³"
        }
    })
    return formatData(data);
}
 
function formatData (locations) {
    let out = [];
    locations.forEach(location => {
        let filtered = Object.entries(location.values).filter(([key, value]) => value !== null)
        filtered.forEach(([key, value]) => {
            out.push({
                location: location.stationName,
                city: location.stationName,
                coordinates: location.coordinates,
                parameter: key,
                value: value,
                unit: location.unit,
                date: location.date,
                attribution: [
                    {
                        name: 'Air Quality Kosova',
                        url: 'https://airqualitykosova.rks-gov.net/en/'
                      }
                ],
                averagingPeriod: { unit: 'hours', value: 1 }
            })
        })
    })
    return { name: 'unused', measurements: out };
}



// getData().then(data => console.log(data));