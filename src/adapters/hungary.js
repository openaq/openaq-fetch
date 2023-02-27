/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Hungary data sources.
 */
import { DateTime } from 'luxon';
import fetch from 'node-fetch'

const STATIONS_URL = 'https://legszennyezettseg.met.hu/api/terkep'

// Get the current time in Hungary
let dt = DateTime.local().setZone('Europe/Budapest');

// Subtract one hour
dt = dt.minus({ hours: 1 });

console.log(dt.toISO()); // Output in ISO format (e.g. "2023-02-27T08:30:00.000+01:00")
console.log(dt.toLocal().toLocaleString(DateTime.DATETIME_FULL));
const localIso = dt.setZone('local').toISO();

console.log(localIso);

async function fetchData() {
    try {
      let stations = await fetchStations(STATIONS_URL);
  
      // Map through each station object and fetch data for each station
      let requests = stations.data.map(station => {
        if (station.hasOwnProperty('stationId')) {
          const stationId = station.stationId;
          const url = `https://legszennyezettseg.met.hu/api/terkep/${stationId}`;
          return fetch(url)
            .then(response => response.json())
            .then(data => {
              // Add fetched data to station object
              station.station = data.data.stationName;
              station.month = data.data.month;
              station.hour = data.data.lastHour;
              station.measurements = data.data.lastHourValues;
              return station;
            })
            .catch(error => {
              throw error;
            });
        }
      });
  
      // Wait for all fetch requests to complete and return array of station objects
      let allStationData = await Promise.all(requests);
      // let out = formatData(stationData)
    //   console.log(stationData);
      return allStationData;
      // return out;
    } catch (error) {
      console.error(error);
    }
  }
  

async function fetchStations (stationUrl) {
try {
    let response = await fetch (stationUrl);
    let stations = await response.json();
    return stations
} catch (error) {
    throw error;
}
}

async function formatData() {

}

fetchData()
// fetchStations(STATIONS_URL)
.then((measurements) => {
    console.dir(measurements, {depth:null});
  })
  .catch((error) => {
    console.error(error);
  });

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
        case 'PM₂,₅':
            return 'pm25';
        case 'NO':
            return 'no';
        default:
            return name;
        }
  }