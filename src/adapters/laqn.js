'use strict';

import _ from 'lodash';
import client from '../lib/requests.js';
import log from '../lib/logger.js';
import { DateTime } from 'luxon';
import {
  unifyParameters,
  unifyMeasurementUnits,
} from '../lib/utils.js';

export const name = 'laqn';

const unitLookup = {
  CO: 'mg/m3',
  NO2: 'µg/m3',
  O3: 'µg/m3',
  PM10: 'µg/m3',
  PM25: 'µg/m3',
  SO2: 'µg/m3',
};

export async function fetchData(source, cb) {
  try {
    const timeZone = 'Europe/London';
    const dateNow = source.datetime
      ? source.datetime.setZone(timeZone)
      : DateTime.local().setZone(timeZone);

    const startDate = dateNow.toFormat('dd LLL yyyy');
    const endDate = dateNow.plus({ days: 1 }).toFormat('dd LLL yyyy');

    const siteCodes = await client({
      url: `${source.url}/AirQuality/Information/MonitoringSites/GroupName=All/Json`
    });
    let allSites = siteCodes.Sites.Site;
    allSites = allSites.filter((s) => !s['@DateClosed']);
    const siteLookup = _.keyBy(allSites, '@SiteCode');
    const dataPromises = allSites.map((site) =>
				client({
						url: `${source.url}/AirQuality/Data/Site/SiteCode=${site['@SiteCode']}/StartDate=${startDate}/EndDate=${endDate}/Json`
				})
        .catch((error) => {
          log.warn(
            `Unable to load data for site: ${site['@SiteCode']} - HTTP status: ${error}`
          );
          return null;
        })
        .then((data) => {
          if (data) {
            return formatData(data, siteLookup);
          } else {
            return null;
          }
        })
    );

    const allData = await Promise.all(dataPromises);
    const measurements = _.flatten(allData).filter((d) => d);
    cb(null, { name: 'unused', measurements });
  } catch (e) {
    cb(e);
  }
}

// Convert data to standard format
function formatData(dataObject, siteLookup) {
  if (!dataObject) return null;
  //const dataObject = JSON.parse(data);
  if (!_.isArray(dataObject.AirQualityData.Data)) return null;
  const site = siteLookup[dataObject.AirQualityData['@SiteCode']];
  const measurements = dataObject.AirQualityData.Data.map(
    (element) => {
      const measurementDate = element['@MeasurementDateGMT'];
      const parameter = element['@SpeciesCode'];
      const value = element['@Value'];
      if (!value || !parameter || !measurementDate) return null;
      const format = 'yyyy-MM-dd HH:mm:ss';
      const date = DateTime.fromFormat(measurementDate, format, {
        zone: 'utc',
      });
      let m = {
        location: site['@SiteName'],
        value: parseFloat(value),
        unit: unitLookup[parameter],
        parameter: parameter,
        averagingPeriod: {
          value: 1,
          unit: 'hours',
        },
        date: {
          utc: date.toISO({ suppressMilliseconds: true }),
          local: date
            .setZone('Europe/London')
            .toISO({ suppressMilliseconds: true }),
        },
        coordinates: {
          latitude: parseFloat(site['@Latitude']),
          longitude: parseFloat(site['@Longitude']),
        },
        attribution: [
          {
            name: 'Environmental Research Group of Imperial College London',
            url: 'https://www.imperial.ac.uk/school-public-health/environmental-research-group/',
          },
          {
            name: 'London Air Quality Network',
            url: 'https://www.londonair.org.uk',
          },
          {
            name: site['@DataOwner'],
            url: site['@SiteLink'],
          },
        ],
        city: site['@LocalAuthorityName'],
        country: 'GB',
        sourceName: 'London Air Quality Network',
        sourceType: 'government',
        mobile: false,
      };
      m = unifyParameters(m);
      m = unifyMeasurementUnits(m);
      return m;
    }
  );
  return measurements;
}
