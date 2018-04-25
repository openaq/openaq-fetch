import { acceptableParameters, convertUnits } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import tzlookup from 'tz-lookup';
import { MultiStream, DataStream, StringStream } from 'scramjet';
import { default as JSONStream } from 'JSONStream';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const stationsLink = 'http://battuta.s3.amazonaws.com/eea-stations-all.json';

export const name = 'eea-direct';

export function fetchStream (source) {
  const out = new DataStream();
  out.name = 'unused';

  fetchMetadata(source)
    .then((stations) => fetchPollutants(source, stations))
    .then(stream => stream.pipe(out))
  ;

  return out;
}

export async function fetchData (source, cb) {
  try {
    const stream = await fetchStream(source);
    const measurements = await stream.toArray();
    cb(null, {name: stream.name, measurements});
  } catch (e) {
    cb(e);
  }
}

async function fetchMetadata (source) {
  return request({url: stationsLink})
    .pipe(JSONStream.parse('*'))
    .pipe(new DataStream())
    .filter(({stationId}) => stationId.startsWith(source.country))
    .accumulate((acc, item) => (acc[item.stationId] = item), {});
}

function fetchPollutants (source, stations) {
  const pollutants = acceptableParameters.map(
    (pollutant) => pollutant === 'pm25' ? 'PM2.5' : pollutant.toUpperCase()
  );

  return new MultiStream(
    pollutants.map(pollutant => {
      const url = source.url + source.country + '_' + pollutant + '.csv';
      const timeLastInsert = moment().utc().subtract(2, 'hours');
      let header;

      return new StringStream()
        .use(stream => {
          const resp = request.get({url})
            .on('response', ({statusCode}) => {
              +statusCode !== 200
                ? stream.end()
                : resp.pipe(stream);
            });
          return stream;
        })
        .CSVParse({header: false, delimiter: ',', skipEmptyLines: true})
        .shift(1, columns => (header = columns[0]))
        .filter(o => o.length === header.length)
        .map(o => header.reduce((a, c, i) => { a[c] = o[i]; return a; }, {}))
        // TODO: it would be good to provide the actual last fetch time so that we can filter already inserted items in a better way
        .filter(o => moment(o.value_datetime_inserted).utc().isAfter(timeLastInsert))
        .filter(o => o.station_code in stations)
        .map(record => {
          const matchedStation = stations[record.station_code];
          const timeZone = tzlookup(matchedStation.latitude, matchedStation.longitude);
          return {
            location: record['station_code'],
            city: matchedStation.city ? matchedStation.city : (
              matchedStation.location ? matchedStation.location : source.city
            ),
            coordinates: {
              latitude: Number(matchedStation.latitude),
              longitude: Number(matchedStation.longitude)
            },
            parameter: record['pollutant'].toLowerCase().replace('.', ''),
            date: makeDate(record['value_datetime_end'], timeZone),
            value: Number(record['value_numeric']),
            unit: record['value_unit'],
            attribution: [{
              name: 'EEA',
              url: source.sourceURL
            }],
            averagingPeriod: {
              unit: 'hours',
              value: 1
            }
          };
        })
        // TODO: a stream transform would be preferred - batch is used to increase efficiency
        .batch(64)
        .flatMap(convertUnits)
      ;
    }))
    .mux()
  ;
}

const makeDate = (date, timeZone) => {
  // parse date, considering its utc offset
  date = moment.parseZone(date);
  // pass parsed date as a string plus station timeZone offset to generate local time.
  const localDate = moment.tz(date.format(), timeZone);
  // Force local data format to get around issue where +00:00 shows up as Z
  return {
    utc: date.toDate(),
    local: localDate.format('YYYY-MM-DDTHH:mm:ssZ')
  };
};
