/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the New South Wales data sources.
 */

'use strict';

import log from '../lib/logger.js';
import client from '../lib/requests.js';
import { DateTime } from 'luxon';

export const parameters = {
  CO: { name: 'co', unit: 'ppm' },
  HUMID: { name: 'relativehumidity', unit: '%' },
  NO: { name: 'no', unit: 'pphm' },
  NO2: { name: 'no2', unit: 'pphm' },
  OZONE: { name: 'o3', unit: 'pphm' },
  PM10: { name: 'pm10', unit: 'µg/m³' },
  'PM2.5d': { name: 'pm25', unit: 'µg/m³' },
  SO2: { name: 'so2', unit: 'pphm' },
};

const stationsUrl = 'https://data.airquality.nsw.gov.au/api/Data/get_SiteDetails';
const measurementsUrl = 'https://data.airquality.nsw.gov.au/api/Data/get_Observations';

export const name = 'nsw';

export async function fetchData(source, cb) {
  try {
    // get an object with all the stations, keyed by Site_Id
    const stations = await fetchStations();
      // get a list of all the measurements, filtered to the ones we want
    const measures = await fetchMeasurements();
      // format them
    const measurements = measures.map( m => {
        // get the station
        const station = stations[`${m.Site_Id}`];
        if(station) {
            return formatData(m, stations[`${m.Site_Id}`]);
        } else {
            log.warn(`Could not find site information for ${m.Site_Id}`);
            return null;
        }
    }).filter(d=>!!d);
    return cb(null, { measurements });
  } catch (error) {
    log.error('Failed to fetch data', error);
    cb(error);
  }
}


async function fetchStations() {
  try {
    const response = await client({ url: stationsUrl });
    log.debug('Stations fetched:', response.length);
    // returns an array but reshaping will make it easier to use later
    const stations = Object.assign({}, ...response.map(item => ({[`${item.Site_Id}`]: item})));
    return stations;
  } catch (error) {
    throw new Error(`Fetch stations error: ${error.message}`);
  }
}

async function fetchMeasurements() {
  try {

    const measurements = await client({
      url: measurementsUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

      // only hourly values of core parameters
      // we want nulls because they are missing measurements
      // we assume that they are not measurements we could get later
    const filteredResponse = measurements.filter(m => {
        return parameters[m.Parameter.ParameterCode] && m.Parameter.Frequency === 'Hourly average';
    });
    log.debug('Filtered Measurements:', filteredResponse.slice(0,1));
    return filteredResponse;
  } catch (error) {
      throw new Error(`Fetch measurements error: ${error.message}`);
  }
}



function formatData(measurement, station) {
  // source data is in Sydney time
  const localDate = DateTime.fromISO(`${measurement.Date}T${String(measurement.Hour).padStart(2, '0')}:00:00`, { zone: 'Australia/Sydney' });

  const parameterDetails = parameters[measurement.Parameter.ParameterCode];

  return {
    location: station.SiteName,
    sourceId: station.Site_Id,
    city: station.Region,
    parameter: parameterDetails.name,
    value: measurement.Value,
    unit: parameterDetails.unit,
    coordinates: {
      latitude: parseFloat(station.Latitude),
      longitude: parseFloat(station.Longitude),
    },
    date: {
      utc: localDate.toUTC().toISO({suppressMilliseconds: true}),
      local: localDate.toISO({suppressMilliseconds: true})
    },
    averagingPeriod: {
      unit: 'hours',
      value: 1
    },
    attribution: [
      {
      name: 'NSW Government Air Quality Monitoring',
      url: 'https://data.airquality.nsw.gov.au'
    }
  ],
  };
}
