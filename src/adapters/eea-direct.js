import { acceptableParameters } from '../lib/utils.js';
import log from '../lib/logger.js';
import got from 'got';
import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';
import sj from 'scramjet';
import { default as JSONStream } from 'JSONStream';
const { MultiStream, DataStream, StringStream } = sj;

const stationsLink =
  'http://battuta.s3.amazonaws.com/eea-stations-all.json';

export const name = 'eea-direct';

export function fetchStream (source) {
  const out = new DataStream();
  out.name = 'unused';

  log.debug(`Fetch stream called: ${source.name}`);

  fetchMetadata(source)
    .then((stations) => fetchPollutants(source, stations))
    .then((stream) => stream.pipe(out))
    .catch((error) => {
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

let _battuta = null;
function getBattutaStream () {
  if (!_battuta) {
    const gotStream = got.stream(stationsLink);

    _battuta = DataStream.pipeline(gotStream, JSONStream.parse('*'))
      .catch((e) => {
        gotStream.destroy();
        e.stream.end();
        log.debug(e);
        throw e;
      })
      .keep(Infinity);
  }

  return _battuta.rewind();
}
async function fetchMetadata(source) {
  return getBattutaStream()
    .filter(({ stationId }) => stationId.startsWith(source.country))
    .accumulate((acc, item) => (acc[item.stationId] = item), {});
}

function fetchPollutants(source, stations) {
  const pollutants = acceptableParameters.map((pollutant) =>
    pollutant === 'pm25' ? 'PM2.5' : pollutant.toUpperCase()
  );

  return new MultiStream(
    pollutants.map((pollutant) => {
      const url =
        source.url + source.country + '_' + pollutant + '.csv';
      const offset = source.offset || 2;
      const timeLastInsert = source.datetime
        ? source.datetime
        : DateTime.utc().minus({ hours: offset });
      let header;

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
        .shift(1, (columns) => (header = columns[0]))
        .filter((o) => o.length === header.length)
        .map((o) =>
          header.reduce((a, c, i) => {
            a[c] = o[i];
            return a;
          }, {})
        )
        .filter((o) => {
          const isoDate = o.value_datetime_inserted.replace(' ', 'T');
          return (
            DateTime.fromISO(isoDate, { setZone: true })
              .toUTC()
              .toMillis() > timeLastInsert.toMillis()
          );
        })

        .filter((o) => o.value_validity == 1)
        .filter((o) => o.value_numeric.trim() !== '')
        .filter((o) => o.station_code in stations)
        .map((record) => {
          const matchedStation = stations[record.station_code];
          const timeZone = tzlookup(
            matchedStation.latitude,
            matchedStation.longitude
          );
          return {
            location: record.station_code,
            city: matchedStation.city
              ? matchedStation.city
              : matchedStation.location
                ? matchedStation.location
                : source.city,
            coordinates: {
              latitude: Number(matchedStation.latitude),
              longitude: Number(matchedStation.longitude),
            },
            parameter: record.pollutant
              .toLowerCase()
              .replace('.', ''),
            date: makeDate(record.value_datetime_end, timeZone),
            value: Number(record.value_numeric),
            unit: record.value_unit,
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
        });
    })
  ).mux();
}

const makeDate = (date, timeZone) => {
  date = DateTime.fromISO(date.replace(' ', 'T'), { setZone: true });
  const localDate = date.setZone(timeZone);

  return {
    utc: date.toUTC().toISO({ suppressMilliseconds: true }),
    local: localDate.toISO({ suppressMilliseconds: true }),
  };
};
