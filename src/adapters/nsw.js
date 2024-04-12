/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the New South Wales data sources.
 */

'use strict';

import log from '../lib/logger.js';
import client from '../lib/requests.js';
import {
  unifyMeasurementUnits,
} from '../lib/utils.js';

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
    const stations = await fetchStations();
    const measurements = await fetchMeasurements();

    const combinedData = combineData(stations, measurements);
    const unifiedData = combinedData.map((data) => {
      return unifyMeasurementUnits(data);
    })
    console.dir(unifiedData, { depth: null}
      // .slice(0,5)
    );
    return cb(null, unifiedData);
  } catch (error) {
    log.error('Failed to fetch data', error);
    cb(error);
  }
}

async function fetchStations() {
  try {
    const response = await client({ url: stationsUrl });
    log.debug('Stations fetched:', response.slice(0,1));
    return response;
  } catch (error) {
    log.error('Error fetching stations:', error);
    // throw error;
  }
}

async function fetchMeasurements() {
  try {

    const response = await client({
      url: measurementsUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const filteredResponse = response.filter(measurement => {
      // Check if the parameter is defined in our object and the unit matches
      const paramKey = Object.keys(parameters).find(key => 
        key.toUpperCase() === measurement.Parameter.ParameterCode.toUpperCase() &&
        parameters[key].unit === measurement.Parameter.Units
      );
      return paramKey && measurement.Value !== null && measurement.Parameter.Frequency === 'Hourly average';
    });

    log.debug('Filtered Measurements:', filteredResponse.slice(0,1));
    return filteredResponse;
  } catch (error) {
    log.error('Error fetching measurements:', error);
    // throw error; 
  }
}


function combineData(stations, measurements) {
  return measurements.map(measurement => {
    const station = stations.find(s => s.Site_Id === measurement.Site_Id);
    if (!station) {
      log.warn('Station not found for measurement:', measurement);
      return null;
    }
    return formatMeasurement(measurement, station);
  }).filter(measurement => measurement);
}

function formatMeasurement(measurement, station) {
  const utcDate = DateTime.fromISO(`${measurement.Date}T${String(measurement.Hour).padStart(2, '0')}:00:00Z`);
  const localDate = utcDate.setZone("Australia/Sydney");

  const parameterDetails = parameters[measurement.Parameter.ParameterCode]
  return {
    location: station.SiteName,
    city: station.Region,
    parameter: parameterDetails.name,
    value: measurement.Value,
    unit: parameterDetails.unit,
    coordinates: {
      latitude: parseFloat(station.Latitude),
      longitude: parseFloat(station.Longitude),
    },
    date: {
      utc: utcDate.toUTC().toISO({suppressMilliseconds: true}),
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
