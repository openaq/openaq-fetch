'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { findIndex } from 'lodash';
import { parallelLimit } from 'async';
import { convertUnits, safeParse, acceptableParameters } from '../lib/utils';
import { join } from 'path';
// Adding in certs to get around unverified connection issue
require('ssl-root-cas/latest')
  .inject()
  .addFile(join(__dirname, '..', '/certs/lets-encrypt-x3-cross-signed.pem.txt'));
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'caaqm';

export function fetchData (source, cb) {
  const requestOptions = {
    method: 'POST',
    headers: {
      'accept-language': 'en-US,en',
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    form: false
  };
  const options = Object.assign(requestOptions, {
    url: source.url,
    body: Buffer.from('{"region":"landing_dashboard"}').toString('base64')
  });
  request(options, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Parse the response
    body = safeParse(body);
    if (body === undefined) {
      return cb({message: 'Failure to parse data.'});
    }

    // Generate a list of site_ids we'll need to check based on parameters present
    // and last updated dates
    let sites = [];
    body['map']['station_list'].forEach((s) => {
      // At this point, check to make sure the parameters were last updated
      // within the last 35 minutes
      var fromDate = moment.tz(s['parameter_latest_update_date'], 'YYYY-MM-DD HH:mm:ss', 'Asia/Kolkata');
      var minuteDiff = moment().utc().diff(fromDate.toDate(), 'minutes');
      if (minuteDiff < 0 || minuteDiff > 35) {
        return;
      }

      // Check if it has parameters we want
      for (var i = 0; i < s['parameter_status'].length; i++) {
        const p = s['parameter_status'][i];
        if (['PM2.5', 'PM10', 'NO2', 'CO', 'SO2', 'NO2', 'BC', 'Ozone'].includes(p['parameter_name'])) {
          sites.push({
            station_id: s['station_id'],
            station_name: s['station_name'],
            coords: {latitude: Number(s['latitude']), longitude: Number(s['longitude'])}
          });

          // Short circuit the loop since we know we want this site
          return;
        }
      }
    });

    // Generate async requests for all the individual sites
    const tasks = sites.map((s) => {
      return (done) => {
        const options = Object.assign(requestOptions, {
          url: 'https://app.cpcbccr.com/caaqms/caaqms_view_data',
          body: Buffer.from(`{"site_id":"${s['station_id']}"}`).toString('base64')
        });

        return request(options, (err, res, body) => {
          if (err || !res.statusCode === 200) {
            return done(null, {});
          }

          body = safeParse(body);
          if (body === undefined) {
            return done(null, {});
          }

          return done(null, body);
        });
      };
    });

    // Run the async requests
    parallelLimit(tasks, 5, (err, results) => {
      if (err) {
        return cb({message: 'Failure to load data urls.'});
      }

      // Wrap everything in a try/catch in case something goes wrong
      try {
        // Format the data
        const data = formatData({sites: sites, results: results});
        // Make sure the data is valid
        if (data === undefined) {
          return cb({message: 'Failure to parse data.'});
        }
        cb(null, data);
      } catch (e) {
        return cb({message: 'Unknown adapter error.'});
      }
    });
  });
}

const formatData = (data) => {
  // Placeholder for measurements
  let measurements = [];

  // Loop over results from individual stations and start building up the measurements array
  data.results.forEach((site) => {
    // Make sure we have a valid site object
    if (!site || !site.siteInfo || !site.siteInfo.siteId) {
      return;
    }

    const coords = data.sites[findIndex(data.sites, {'station_id': site.siteInfo.siteId})].coords;
    site.tableData.bodyContent.forEach((p) => {
      let parameter = p.parameters.toLowerCase().replace('.', '');
      parameter = (parameter === 'ozone') ? 'o3' : parameter;

      // Make sure we want the pollutant
      if (!acceptableParameters.includes(parameter)) {
        return;
      }

      let m = {
        averagingPeriod: {unit: 'hours', value: 0.25},
        city: site.siteInfo.city,
        location: site.siteInfo.siteName,
        coordinates: coords,
        attribution: [{name: 'Central Pollution Control Board', url: 'https://app.cpcbccr.com/ccr/#/caaqm-dashboard-all/caaqm-landing'}],
        parameter: parameter,
        unit: p.unit,
        value: Number(p.concentration)
      };

      // Date
      const date = moment.tz(`${p.date} ${p.time}`, 'DD MMM YYYY HH:mm', 'Asia/Kolkata');
      m.date = {utc: date.toDate(), local: date.format()};

      measurements.push(m);
    });
  });

  measurements = convertUnits(measurements);

  return {name: 'unused', measurements: measurements};
};
