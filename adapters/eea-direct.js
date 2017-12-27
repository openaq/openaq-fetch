import { acceptableParameters, convertUnits } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { parallel, map } from 'async';
import tzlookup from 'tz-lookup';
import { default as parse } from 'csv-parse/lib/sync';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
const stationsLink = 'http://battuta.s3.amazonaws.com/eea-stations-all.json';

export const name = 'eea-direct';

export function fetchData (source, cb) {
  const metadataRequest = makeMetadataRequest(source);
  const requestTasks = makeTaskRequests(source);
  parallel(
    [metadataRequest, requestTasks],
    (err, res) => {
      if (err) {
        return cb('Error getting data from source', []);
      }
      try {
        formatData(res, source, cb);
      } catch (e) {
        cb({message: 'Error parsing the data'}, null);
      }
    });
}

// Location info by station is not reported on consistently. Instead of using
// the metadata that is included in the CSV file, this adapter relies on
// Battuta (https://github.com/openaq/battuta) to provide station metadata.
const makeMetadataRequest = (source) => {
  return (cb) => {
    request.get({
      url: stationsLink
    }, (err, res, body) => {
      if (err || res.statusCode !== 200) {
        return cb('Could not gather current metadata, will generate records without coordinates.', []);
      }
      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        return cb('Could not parse metadata file', []);
      }
      cb(null, data);
    });
  };
};

// makes requests to get country's pollutant data.
const makeTaskRequests = (source) => {
  const pollutantRequests = acceptableParameters.map((pollutant) => {
    switch (pollutant) {
      case 'pm25':
        pollutant = 'PM2.5';
        break;
      default:
        pollutant = pollutant.toUpperCase();
    }

    return (done) => {
      const url = source.url + source.country + '_' + pollutant + '.csv';
      request.get({
        url: url
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        done(null, parse(body, {columns: true, relax_column_count: true}));
      });
    };
  });
  return (done) => {
    parallel(
      pollutantRequests,
      (err, response) => {
        if (err) {
          done(null, []);
        }
        done(null, [].concat.apply([], response));
      }
    );
  };
};

// formats data to match openAQ standard
const formatData = (data, source, cb) => {
  const stations = data[0];

  // the CSV files contain 48 hours worth of data
  // filter this down to records that were inserted up to two hours ago
  // this vastly reduces the amount of redundant inserts fetch tries to make
  const timeLastInsert = data[1].reduce((a, b) => Math.max(a, Date.parse(b.value_datetime_inserted) || 0), 0);
  const records = data[1].filter(o => Date.parse(o.value_datetime_inserted) > (timeLastInsert - 3700000));

  map(records, (record, done) => {
    const matchedStation = stations.find(station => station.stationId === record['station_code']);
    if (!(matchedStation)) {
      return done(null, {});
    }
    const timeZone = tzlookup(matchedStation.latitude, matchedStation.longitude);
    let m = {
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
    // apply unit conversion to generated record
    done(null, convertUnits([m])[0]);
  }, (err, measurements) => {
    if (err) {
      return cb(null, {name: 'unused', measurements: []});
    }
    cb(null, {name: 'unused', measurements: measurements});
  });
};

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
