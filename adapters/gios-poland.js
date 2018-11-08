import request from 'request';
import rp from 'request-promise-native';
import { parse as JSONStream } from 'JSONStream';
import { DataStream } from 'scramjet';
import { FetchError } from '../lib/errors';
import log from '../lib/logger';
import { acceptableParameters } from '../lib/utils';
import moment from 'moment-timezone';

export const name = 'GIOS';
const resolveParameter = (param) => param.toLowerCase().replace('c6h6', 'bc').replace('.', '');
/** @returns Moment */
const makeDate = (date) => moment.tz(date, 'Europe/Warsaw');

export function fetchStream ({
  url, country, attribution, sourceType, mobile, averagingPeriod, hoursToFetch
}) {
  const stationUrl = `${url}/station/findAll`;

  return DataStream
    .from(request.get(stationUrl).pipe(JSONStream('*')))
    .map(
      ({
        id,
        stationName,
        gegrLat: latitude, gegrLon: longitude,
        city: { name: city }
      }) =>
        ({
          stationId: id,
          base: {
            location: stationName,
            coordinates: {
              latitude,
              longitude
            },
            city,
            country
          },
          attribution,
          averagingPeriod,
          sourceType,
          mobile
        })
    )
    .flatMap(
      async ({ stationId, base }) => {
        log.debug(`Getting sensors for station ${stationId}`);
        try {
          const sensors = JSON.parse(await rp(`${url}/station/sensors/${stationId}`));

          return sensors
            .map(
              ({ id: sensorId, param: { paramCode } }) => ({
                sensorId,
                base
              })
            )
            .filter(
              ({ parameter }) => parameter in acceptableParameters
            );
        } catch (e) {
          throw new FetchError(`Cannot parse sensors information for station ${stationId}`);
        }
      }
    )
    .flatMap(
      async ({ sensorId, base }) => {
        const data = JSON.parse(await rp(`${url}/getData/${sensorId}`));
        const parameter = resolveParameter(data.key);
        const unit = 'μg/m3';

        const values = Array.from(data.values);
        const lastIndex = values.findIndex(item => {
          item.tzDate = makeDate(item.date);
          return item.tzDate.add(hoursToFetch, 'hours').isBefore();
        });

        return values.slice(0, lastIndex)
          .map(
            ({tzDate, value}) => Object.assign(
              {parameter, unit, value, date: {local: tzDate.format()}}, base
            )
          );
      }
    )
  ;
}
