import { REQUEST_TIMEOUT } from '../lib/constants.js';
import request from 'request';
import rp from 'request-promise-native';
import { parse as JSONStream } from 'JSONStream';
import sj from 'scramjet';
const { DataStream } = sj;
import { FetchError, DATA_URL_ERROR } from '../lib/errors.js';
import log from '../lib/logger.js';
import { acceptableParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';
import got from 'got';

const gotExtended = got.extend({
	retry: { limit: 3 },
	timeout: { request: REQUEST_TIMEOUT },
	});
  
const resolveParameter = (param) =>
  param.toLowerCase().replace('c6h6', 'bc').replace('.', '');
// const makeDate = (date) => moment.tz(date, 'Europe/Warsaw');
const makeDate = (date) =>
  DateTime.fromFormat(date, 'yyyy-MM-dd HH:mm:ss', {
    zone: 'Europe/Warsaw',
  });

export const name = 'gios-poland';

export function fetchStream(source) {
  const {
    url,
    country,
    attribution,
    sourceType,
    mobile,
    averagingPeriod,
    hoursToFetch,
  } = source;

  const stationUrl = `${url}/station/findAll`;
  const requestObject = request.get(stationUrl);
  return DataStream.pipeline(requestObject, JSONStream('*'))
    .catch((e) => {
      requestObject.abort();
      e.stream.end();
      throw e;
    })
    .map(
      ({
        id,
        stationName,
        gegrLat,
        gegrLon,
        city: { name: city },
      }) => ({
        stationId: id,
        base: {
          location: stationName,
          coordinates: {
            latitude: +gegrLat,
            longitude: +gegrLon,
          },
          city,
          country,
        },
        attribution,
        averagingPeriod,
        sourceType,
        mobile,
      })
    )
    .flatMap(async ({ stationId, base }) => {
      const _url = `${url}/station/sensors/${stationId}`;
      log.debug(`Getting sensors for station ${stationId}`);
      try {
        const sensors = JSON.parse(await rp(_url));

        return sensors
          .map(({ id: sensorId, param: { paramCode } }) => ({
            sensorId,
            parameter: resolveParameter(paramCode),
            base,
          }))
          .filter(({ parameter }) =>
            acceptableParameters.includes(parameter)
          );
      } catch (e) {
        log.debug(`Error while fetching data from ${_url}`);
        throw new FetchError(
          DATA_URL_ERROR,
          source,
          e,
          `Error fetching or parsing data for station`
        );
      }
    })
    .flatMap(async ({ sensorId, parameter, base }) => {
      const _url = `${url}/data/getData/${sensorId}`;
      try {
        const data = JSON.parse(await rp(_url));
        const unit = 'µg/m³';

        const values = Array.from(data.values);
        const lastIndex = values.findIndex((item) => {
          item.tzDate = makeDate(item.date).toISO({
            suppressMilliseconds: true,
          });

          const currentDate = DateTime.fromISO(item.tzDate, {
            zone: 'utc',
          });
          const thresholdDate = DateTime.local()
            .toUTC()
            .minus({ hours: hoursToFetch });

          if (currentDate < thresholdDate) {
            return true;
          }
        });

        return values
          .slice(0, lastIndex)
          .filter(({ value }) => value !== null)
          .map(({ tzDate, value }) =>
            Object.assign(
              {
                parameter,
                unit,
                value: +value,
                date: { local: tzDate },
              },
              base
            )
          );
      } catch (e) {
        log.debug(`Error while fetching data from ${_url}`);
        throw new FetchError(
          DATA_URL_ERROR,
          source,
          e,
          `code: ${e.statusCode}`
        );
      }
    });
}
