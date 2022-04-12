'use strict';

import { default as moment } from 'moment-timezone';
import _ from 'lodash';
import log from '../lib/logger.js';
import { promiseRequest, unifyParameters, unifyMeasurementUnits } from '../lib/utils.js';

export const name = 'laqn';

// API does not publish units but we got them directly from the data source
const unitLookup = {
  'CO': 'mg/m3',
  'NO2': 'µg/m3',
  'O3': 'µg/m3',
  'PM10': 'µg/m3',
  'PM25': 'µg/m3',
  'SO2': 'µg/m3'
};

export async function fetchData (source, cb) {
  try {
    let dateNow = moment().tz('Europe/London');
    let startDate = dateNow.format('DD MMM YYYY');
    let endDate = dateNow.add(1, 'days').format('DD MMM YYYY');
    let siteCodesResponse = await promiseRequest(
      `${source.url}/AirQuality/Information/MonitoringSites/GroupName=All/Json`
    );
    let allSites = JSON.parse(siteCodesResponse).Sites.Site;
    let siteLookup = _.keyBy(allSites, '@SiteCode');
    let dataPromises = allSites.map((site) =>
      promiseRequest(`${source.url}/AirQuality/Data/Site/SiteCode=${site['@SiteCode']}/StartDate=${startDate}/EndDate=${endDate}/Json`)
        // in case a request fails, handle gracefully
        .catch(error => { log.warn(error || `Unable to load data for site: ${site['@SiteCode']}`); return null; })
        .then(data => formatData(data, siteLookup)));

    let allData = await Promise.all(dataPromises);
    let measurements = _.flatten(allData).filter(d => d);
    cb(null, { name: 'unused', measurements });
  } catch (e) {
    cb(e);
  }
}

// Convert data to standard format
function formatData (data, siteLookup) {
  if (!data) return null;
  let dataObject = JSON.parse(data);
  if (!_.isArray(dataObject.AirQualityData.Data)) return null;
  let site = siteLookup[dataObject.AirQualityData['@SiteCode']];
  const measurements = dataObject.AirQualityData.Data.map(element => {
    let measurementDate = element['@MeasurementDateGMT'];
    let parameter = element['@SpeciesCode'];
    let value = element['@Value'];
    if (!value || !parameter || !measurementDate) return null;
    let date = moment.utc(measurementDate, 'YYYY-MM-DD HH:mm:ss');
    let m = {
      location: site['@SiteName'],
      value: Number(value),
      unit: unitLookup[parameter],
      parameter: parameter,
      averagingPeriod: {
        value: 1,
        unit: 'hours'
      },
      date: {
        utc: date.toDate(),
        local: date.format('YYYY-MM-DDTHH:mm:ssZ')
      },
      coordinates: {
        latitude: Number(site['@Latitude']),
        longitude: Number(site['@Longitude'])
      },
      attribution: [
        {
          'name': 'Environmental Research Group of Imperial College London',
          'url': 'https://www.imperial.ac.uk/school-public-health/environmental-research-group/'
        },
        {
          'name': 'London Air Quality Network',
          'url': 'https://www.londonair.org.uk'
        },
        {
          'name': site['@DataOwner'],
          'url': site['@SiteLink']
        }
      ],
      city: site['@LocalAuthorityName'],
      country: 'GB',
      sourceName: 'London Air Quality Network',
      sourceType: 'government',
      mobile: false
    };
    m = unifyParameters(m);
    m = unifyMeasurementUnits(m);
    return m;
  });
  return measurements;
}
