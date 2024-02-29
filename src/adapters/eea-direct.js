import { acceptableParameters } from '../lib/utils.js';
import log from '../lib/logger.js';
import got from 'got';
import { DateTime } from 'luxon';
import sj from 'scramjet';
const { MultiStream, DataStream, StringStream } = sj;

export const name = 'eea-direct';

export function fetchStream (source) {
  const out = new DataStream();
  out.name = 'unused';

  log.debug(`Fetch stream called: ${source.name}`);

  const stream = fetchPollutants(source);
  stream.pipe(out).catch((error) => {
    log.error(`Error fetching stream: ${error.message}`);
    out.end();
  });

  return out;
}

export async function fetchData (source, cb) {
  try {
    const stream = await fetchStream(source);
    const measurements = await stream.toArray();
    cb(null, { name: stream.name, measurements });
  } catch (e) {
    cb(e);
  }
}

function fetchPollutants (source) {
  const pollutants = acceptableParameters.map((pollutant) =>
    pollutant === 'pm25' ? 'PM2.5' : pollutant.toUpperCase()
  );

  const timeThreshold = source.datetime
    ? DateTime.fromISO(source.datetime)
    : DateTime.utc().minus({ hours: source.offset || 2 });

  return new MultiStream(
    pollutants.map((pollutant) => {
      const url = source.url + source.country + '_' + pollutant + '.csv';
      let rowCount = 0;

      return new StringStream()
        .use((stream) => {
          const resp = got.stream(url).on('error', (error) => {
            stream.end();
            log.debug(error);
          });
          resp.pipe(stream);

          return stream;
        })
        .CSVParse({
          header: false,
          delimiter: ',',
          skipEmptyLines: true,
        })
        .map(record => {
          rowCount++;
          if (rowCount === 1) return null; // Skip the first row (header)

          const latitude = parseFloat(record[9]);
          const longitude = parseFloat(record[8]);

          if (isNaN(latitude) || isNaN(longitude)) {
            log.error(`Invalid coordinate value for record: ${record}`);
            return null;
          }

          const utcDate = record[16] && DateTime.fromSQL(record[16], { zone: 'utc' }).toISO({ suppressMilliseconds: true });
          const localDate = record[15] && DateTime.fromSQL(record[15]).toISO({ suppressMilliseconds: true });

          if (!utcDate || !localDate) {
            log.error(`Invalid date value for record: ${record}`);
            return null;
          }

          if (DateTime.fromISO(utcDate).toMillis() < timeThreshold.toMillis()) {
            return null;
          }
          // fix units and convert values
          if (record[23] === 'mg/m3' || record[23] === 'mg/m³') {
            record[19] = parseFloat(record[19]) * 1000;
            record[23] = 'µg/m³';
          }
          return {
            location: record[1],
            city: record[2],
            coordinates: {
              latitude,
              longitude,
            },
            parameter: record[5].toLowerCase().replace('.', ''),
            date: {
              utc: utcDate,
              local: localDate,
            },
            value: parseFloat(record[19]),
            unit: record[23] === 'ug/m3' || record[23] === 'µg/m3' ? 'µg/m³' : record[23],
            attribution: [
              {
                name: 'EEA',
                url: source.sourceURL,
              },
            ],
            averagingPeriod: {
              unit: 'hours',
              value: 1,
            },
          };
        })
        .filter(record => record !== null)
    })
  ).mux().catch((error) => {
    log.debug("Error in MultiStream:", error);
  });
}
