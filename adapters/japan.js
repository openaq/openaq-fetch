import { acceptableParameters } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { MultiStream, DataStream, StringStream } from 'scramjet';
import log from '../lib/logger';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'japan';
/*
function fetchStream (source) {
  const out = new DataStream();
  out.name = 'unused';

  log.debug('Fetch stream called');

  loadAllFiles(source)
    .then((stations) => fetchPollutants(source, stations))
    .then(stream => stream.pipe(out))
  ;
  return out;
}
*/
export async function fetchData (source, cb) {
    const sourceURL = source.url+'/'+moment().format('YYYYMM')+'/'+moment().format('YYYYMM')+'_00.zip'
    request({
        method : 'GET',
        url : sourceURL,
        encoding: null
      }, async function (err, res, body) {
        if (err || res.statusCode !== 200) {
          return cb({message: 'Failure to load data url.'});
        }
        // Wrap everything in a try/catch in case something goes wrong
        try {
          // Format the data
        const data = await loadAllFiles(body);
          // Make sure the data is valid
          if (data === undefined) {
            return cb({message: 'Failure to parse data.'});
          }
          cb(null, data);
        } catch (e) {
          return cb({message: 'Unknown adapter error.'});
        }
      });
}
const loadAllFiles = (source) => {
    const JSZip = require('jszip');
    return JSZip.loadAsync(source).then(function (zip) {
        return Object.keys(zip.files).map(z => {
            return JSZip.loadAsync(zip.file(z).async('arraybuffer')).then(async function (f) {
                const csv = [];
                for(let key in Object.keys(f.files)) {
                    csv.push(await f.file(Object.keys(f.files)[key]).async('string'))
                }
                return csv;
            });
        });
    }).then(async function (files) {
        files = await Promise.all(files);
        files = [].concat.apply([], files);
        return files;
    });
}
/*
function loadCSV (files) {
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
        // eslint-disable-next-line eqeqeq
        .filter(o => o.value_validity == 1) // Purposefully using '==' in case the 1 is a string or number
        .filter(o => o.value_numeric.trim() !== '') // Catch emptry string
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
        });
    }))
    .mux()
  ;
}*/
