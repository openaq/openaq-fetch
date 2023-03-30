/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Hungary data sources.
 */

import { removeUnwantedParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';
import fetch from 'node-fetch'

// Get the current time in Hungary
let dt = DateTime.utc();
const { year, month, day } = dt.toObject({ year: 'numeric', month: 'numeric', day: 'numeric' });

export const name  = 'hungary'

export async function fetchData (source, cb) {
  /**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
  try {
    let stations = await fetchStations(source.url);
    // Map through station objects and create data request for each one
    let requests = stations.data.map(station => {
      if (station.hasOwnProperty('stationId')) {
        const stationId = station.stationId;
        const url = `${source.url}${stationId}`
        return fetch(url)
        .then(response => response.json())
        .then(data => {
            // create dateTime object with each station's hour
            const date = DateTime.fromISO(
              `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${data.data.lastHour}`,
              {
                zone: 'Europe/Budapest',
              }
            );
            // Add fetched data to station object
            station.station = data.data.stationName;
            station.month = data.data.month;
            station.utc = dt.toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
            station.local = dt.setZone("Europe/Budapest").toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
            station.measurements = data.data.lastHourValues;
            return station;
          })
          .catch(error => {
            throw error;
          });
      }
    });

    // Wait for all fetch requests to complete in parallel
    let allStationData = await Promise.all(requests);
    let out = await formatData(allStationData)
    return cb(null, out);
  } catch (error) {
    return cb(error);
  }
}
  
async function fetchStations (stationUrl) {
  try {
      let response = await fetch (stationUrl);
      let stations = await response.json();
      return stations
  } catch (error) {
    console.log('Failed to resolve stations URL.')
    throw error;
  }
}

async function formatData(input) {
  let measurements = [];
  input.forEach(o => {
    Object.values(o.measurements).forEach(param => {
      let parameter = correctParam(param.name);
      const [value, unit] = [parseFloat(param.value), param.value.split(' ')[1]];
      let measurement = {
        location: o.station,
        city: o.station,
        parameter,
        value,
        unit,
        date: {
          utc: o.utc,
          local: o.local
        },
        coordinates: {
          latitude: parseFloat(o.latitude),
          longitude: parseFloat(o.longitude)
        },
        attribution: [
          {
          name: "Hungary National Meteorological Service",
          url: "https://legszennyezettseg.met.hu/" 
          }
        ],
        averagingPeriod: {
            unit: "hours",
            value: 1
        }
      }
      measurements.push(measurement)
    });
  });
  measurements = removeUnwantedParameters(measurements);
  measurements = filterMeasurements(measurements);
  measurements = getLatestMeasurements(measurements);
  return { name: 'unused', measurements: measurements }
};

function filterMeasurements(measurements) {
  return measurements.filter((measurement) => {
    return (measurement.value !== undefined &&
            measurement.value === measurement.value &&
            measurement.unit !== undefined &&
            measurement.unit === measurement.unit);
  });
}
  
function getLatestMeasurements(measurements) {
  const latestMeasurements = {};
  measurements.forEach((measurement) => {
    const key = measurement.parameter + measurement.location;
    if (!latestMeasurements[key] || measurement.date.utc > latestMeasurements[key].date.utc) {
      latestMeasurements[key] = measurement;
    }
  });
  return Object.values(latestMeasurements);
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
      case 'PM₂,₅':
          return 'pm25';
      case 'NO':
          return 'no';
      default:
          return name;
      }
}