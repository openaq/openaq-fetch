'use strict';

import sj from 'scramjet';
import { FetchError, DATA_URL_ERROR } from '../lib/errors.js';
import log from '../lib/logger.js';
import { acceptableParameters } from '../lib/utils.js';
import { DateTime } from 'luxon';
import got from 'got';

const { DataStream } = sj;

const resolveParameter = (param) =>
  param.toLowerCase().replace('c6h6', 'bc').replace('.', '');

const makeDate = (date) =>
  DateTime.fromFormat(date, 'yyyy-MM-dd HH:mm:ss', {
    zone: 'Europe/Warsaw'
  });

export const name = 'gios-poland';

export async function fetchStream (source) {
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

  try {
    const stations = JSON.parse(await got(stationUrl).text());
    return DataStream.from(stations)
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
          const sensors = JSON.parse(await got(_url).text());

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
          const data = JSON.parse(await got(_url).text());
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
  } catch (e) {
      throw new Error(e)
      throw new FetchError(
          DATA_URL_ERROR,
          source,
          e,
          `Error resolving url`
      );
  }
}
