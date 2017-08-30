import { acceptableParameters, convertUnits } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { parallel, map } from 'async';
import { writeFileSync, readFileSync } from 'fs';
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

// makes request used to get then format metadata for station coordinates
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
      // getCoordinates(data, source.country, cb);
    });
  };
};

// makes requests to get country's pollutant data.
const makeTaskRequests = (source) => {
  const pollutantRequests = acceptableParameters.map((pollutant) => {
    pollutant = pollutant.toUpperCase();
    return (done) => {
      const url = source.url + source.country + '_' + pollutant + '.csv';
      request.get({
        url: url
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        done(null, parse(body, {relax_column_count: true}).slice(1, -1));
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
  const records = data[1];
  const missed = JSON.parse(readFileSync('./missed.json').toString());
  map(records, (record, done) => {
    const matchedStation = matchStation(stations, record[11]);
    if (!(matchedStation)) {
      return done(null, {});
    }
    const timeZone = tzlookup(matchedStation.latitude, matchedStation.longitude);
    let m = {
      location: matchedStation.location ? matchedStation.location : (
        matchedStation.city ? matchedStation.city : source.location
      ),
      city: matchedStation.city ? matchedStation.city : (
        matchedStation.location ? matchedStation.location : source.city
      ),
      coordinates: {
        latitude: Number(matchedStation.latitude),
        longitude: Number(matchedStation.longitude)
      },
      parameter: record[5].toLowerCase(),
      date: makeDate(record[16], timeZone),
      value: Number(record[19]),
      unit: record[record.length - 1],
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
    writeFileSync('./missed.json', JSON.stringify(missed));
    if (err) {
      return cb(null, {name: 'unused', measurements: []});
    }
    cb(null, {name: 'unused', measurements: measurements});
  });
};

const matchStation = (stations, stationId) => {
  return stations.find((station) => {
    return station.stationId === stationId;
  });
};

const makeDate = (date, timeZone) => {
  // parse date, considering its utc offset
  date = moment.parseZone(date);
  // pass parsed date as a string plus station timeZone offset to generate local time.
  const localDate = moment.tz(date.format(), timeZone);
  return {
    utc: date.toDate(),
    local: localDate.format()
  };
};
