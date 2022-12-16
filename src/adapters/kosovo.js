import { parallel } from 'async';
import { DateTime } from 'luxon';
import fetch from 'node-fetch';

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

// this will be location[n].location to match the station
const locations = "https://airqualitykosova.rks-gov.net/dataservices/chart/AQStations/all?lang=en";

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
        let data = await getData();
        data = await formatData(data);
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

const getMeasurements = async () => {
    try {
        const response = await fetch(ALL_DATA);
        console.log(response.url)
        let data = await response.json();
        data = data.items;
        data.map(measurement => { 
                let [date, time] = measurement.time.split(' ');
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
        const measurement = measurements
        .filter(measurement => measurement.station === station.location)
        .sort((a, b) => b.time.toISO() - a.time.toISO()).pop();
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
    return data;
}
 
function formatData (locations) {
    let out = [];
    locations.forEach(location => {
        let filtered = Object.entries(location.values)
        .filter(([key, value]) => value !== null)
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
};