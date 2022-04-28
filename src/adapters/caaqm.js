'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { acceptableParameters } from '../lib/utils.js';
import log from '../lib/logger.js';
import JSONStream from 'JSONStream';

import sj from 'scramjet';
const { DataStream } = sj;

import https from 'https';
import { FetchError, DATA_URL_ERROR } from '../lib/errors.js';

// From: https://github.com/node-fetch/node-fetch/issues/568#issuecomment-932200523
const agent = new https.Agent({
  rejectUnauthorized: false
});
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'caaqm';

export async function fetchStream (source) {
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
    body: Buffer.from('{"region":"landing_dashboard"}').toString('base64'),
    agent
  });

  const requestObject = request(options);

  return DataStream
    .pipeline(
      requestObject,
      JSONStream.parse('map.station_list.*')
    )
    .catch(e => {
      requestObject.abort();
      e.stream.end();
      throw e;
    })
    .setOptions({ maxParallel: 20 })
    .into((siteStream, site) => {
      return siteStream.whenWrote({
        station_id: site['station_id'],
        station_name: site['station_name'],
        coords: {
          latitude: Number(site['latitude']),
          longitude: Number(site['longitude'])
        },
        status: site['status']
      });
    }, new DataStream())
    .filter((station) => {
      return station.status === 'Live';// && station.station_id == 'site_293';
    })
    .into(
      async (measurements, {coords, station_id: stationId}) => {
        const options = Object.assign(requestOptions, {
          url: 'https://app.cpcbccr.com/caaqms/caaqms_viewdata_v2',
          body: Buffer.from(`{"site_id":"${stationId}"}`).toString('base64'),
          resolveWithFullResponse: true,
          timeout: 20000
        });
        try {
          const body = await getInfo(options, stationId);
          const {siteInfo, tableData: {bodyContent}} = JSON.parse(body);
          await (
            DataStream
              .from(bodyContent)
              .each(async p => {
                let parameter = p.parameters.toLowerCase().replace('.', '');
                parameter = (parameter === 'ozone') ? 'o3' : parameter;

                // Make sure we want the pollutant
                if (!acceptableParameters.includes(parameter)) {
                  return;
                }

                let m = {
                  averagingPeriod: {unit: 'hours', value: 0.25},
                  city: siteInfo.city,
                  location: siteInfo.siteName,
                  coordinates: coords,
                  attribution: [{
                    name: 'Central Pollution Control Board',
                    url: 'https://app.cpcbccr.com/ccr/#/caaqm-dashboard-all/caaqm-landing'
                  }],
                  parameter: parameter,
                  unit: p.unit,
                  value: Number(p.concentration)
                };

                // Date
                const date = moment.tz(`${p.toDate}`, 'DD MMM YYYY HH:mm', 'Asia/Kolkata');
                m.date = {utc: date.toDate(), local: date.format()};
                await measurements.whenWrote(m);
              })
              .run()
          );
        } catch (e) {
          const message = (e.statusCode)
            ? `Status code ${e.statusCode} received on http request for station`
            : `${e.message}`;

          throw new FetchError(DATA_URL_ERROR, source, e, message);
        }
      },
      new DataStream()
    )
  ;
}

async function getInfo (options, stationId) {
  return new Promise((resolve, reject) => {
    request.post(options, (err, res, body) => {
      log.debug(`stationId: ${stationId}, statusCode: ${res ? res.statusCode : 'unknown'}`);
      if (err) {
        log.error(err ? `${err.message} for adapter: ${name} - stationId: ${stationId}` : 'error');
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}
