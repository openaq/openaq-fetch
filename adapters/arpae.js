'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { acceptableParameters, convertUnits } from '../lib/utils';
import { difference, flattenDeep, zip } from 'lodash';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'arpae';

const ckanResourceID = "a1c46cfe-46e5-44b4-9231-7d9260a38e68";
// fixme: date range in sql
const sql = `SELECT * from "${ckanResourceID}" WHERE reftime >= '2017-09-28T23:59:00' AND reftime <= '2017-09-29T00:00:00' ORDER BY reftime DESC`;
const sqlUrl = `https://dati.arpae.it/api/action/datastore_search_sql?sql=${sql}`;

exports.fetchData = function (source, cb) {
    request(sqlUrl, (err, res, body) => {
        if (err || res.statusCode !== 200) {
            return cb(err || res);
        }
        const data = JSON.parse(body);
        const records = data['result']['records'];
        let measurements = [];
        records.forEach((record) => {
            const mDate = moment.tz(record.reftime, source.timezone);
            measurements.push({
                value: Number(record.value),
                unit: 'ppm', // fixme, record.variable_id
                parameter: 'pm25', // fixme, record.variable_id
                date: {
                    utc: mDate.toDate(),
                    local: mDate.format()
                },
                country: source.country,
                city: 'city', // fixme
                name: `Arpae-${record.station_id}`,
                coordinates: {
                    latitude: 0,
                    longitude: 0 // fixme
                },
                attribution: [
                    {
                        name: source.name,
                        url: source.sourceURL
                    }
                ]
            });
        });

        return cb(null, {
            name: 'unused',
            measurements: measurements
        });
    });
};