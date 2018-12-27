'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { acceptableParameters } from '../lib/utils';
import { join } from 'path';
import log from '../lib/logger';
import JSONStream from 'JSONStream';
import { DataStream } from 'scramjet';
import rp from 'request-promise-native';
import { FetchError, DATA_URL_ERROR } from '../lib/errors';

// Adding in certs to get around unverified connection issue
require('ssl-root-cas/latest')
  .inject()
  .addFile(join(__dirname, '..', '/certs/lets-encrypt-x3-cross-signed.pem.txt'));
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
    body: Buffer.from('{"region":"landing_dashboard"}').toString('base64')
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
    .setOptions({maxParallel: 5})
    .into(
      (siteStream, site) => {
        return siteStream.whenWrote({
          station_id: site['station_id'],
          station_name: site['station_name'],
          coords: {latitude: Number(site['latitude']), longitude: Number(site['longitude'])}
        });
      },
      new DataStream()
    )
    .into(
      async (measurements, {coords, station_id: stationId}) => {
        const options = Object.assign(requestOptions, {
          url: 'https://app.cpcbccr.com/caaqms/caaqms_viewdata_v2',
          body: Buffer.from(`{"site_id":"${stationId}"}`).toString('base64'),
          resolveWithFullResponse: true
        });

        try {
          const response = await rp(options);
          const {siteInfo, tableData: {bodyContent}} = JSON.parse(response.body);

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
                const date = moment.tz(`${p.date} ${p.time}`, 'DD MMM YYYY HH:mm', 'Asia/Kolkata');
                m.date = {utc: date.toDate(), local: date.format()};

                await measurements.whenWrote(m);
              })
              .run()
          );
        } catch (e) {
          const message = (e.statusCode)
            ? `Status code ${e.statusCode} received on http request for station`
            : `Error while parsing measurements for station`;

          log.debug({message, stationId, code: e.statusCode});

          throw new FetchError(DATA_URL_ERROR, source, e, message);
        }
      },
      new DataStream()
    )
  ;
}
