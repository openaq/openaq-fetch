/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the United Arab Emerates data sources.
 */
'use strict';

'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { parallel } from 'async';
import { convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'uae';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

const base_url = "https://www.adairquality.ae/AirQualityService/RestServiceImpl.svc/Json/"
// create a list of adairquality endpoints
const endpoints = ["EAD_AlAinSchool?_=1664290671112", "EAD_AlAinStreet?_=1664290671113", 
"EAD_AlMaqta?_=1664290671114", "EAD_AlQuaa?_=1664290671115", "EAD_Habshan?_=1664290671116",
 "EAD_HamdanStreet?_=1664290671117", "EAD_KhadijaSchool?_=1664290671118", "EAD_KhalifaCity?_=1664290671119", 
 "EAD_KhalifaSchool?_=1664290671120", "EAD_Mussafah?_=1664290671121", "EAD_AlTawia?_=1664290671122",
  "EAD_Zakher?_=1664290671123", "EAD_AlMafraq?_=1664290671124", "EAD_Sweihan?_=1664290671125",
  "EAD_Baniyas?_=1664290671126", "EAD_Gayathi?_=1664290671128"]

//combines the base url with the endpoints
const urls = endpoints.map(function(endpoint) {
    return base_url + endpoint;
}
);
//fetches the data from one endpoint at a time, and runs each request in parallel
exports.fetchData = function (source, cb) {
    parallel(
        urls.map(function(url)  {
            return (done) => {
                request(url, function (err, res, body) {
                    if (err || res.statusCode !== 200) {
                        return done({ message: 'Failure to load data url.' });
                    }
                    try {
                        done(null, JSON.parse(body));
                    } catch (e) {
                        return done({ message: 'Failure to parse data.' });
                    }
                });
            };
        }),
        (err, results) => {
            if (err) {
                return cb(err);
            }
            cb(null, { name: 'unused', measurements: formatData(results) });
        }
    );
}

//formats the data into the correct format
const formatData = function (data) {
    var measurements = [];
    var location = "";
    data.forEach(function (result) {
        location = result.Location;
        result.Data.forEach(function (d) {
            var m = {
                location: location,
                parameter: d.Parameter,
                value: d.Value,
                unit: d.Unit,
                date: {
                    utc: d.Date,
                    local: d.Date
                },
                coordinates: {
                    latitude: result.Latitude,
                    longitude: result.Longitude
                },
                attribution: [{
                    name: "AD Air Quality",
                    url: "https://www.adairquality.ae/"
                }],
                averagingPeriod: {
                    unit: "hours",
                    value: 1
                }
            };
            measurements.push(m);
        });
    });
    return { measurements: measurements };
}
