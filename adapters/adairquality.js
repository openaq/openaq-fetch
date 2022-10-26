/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Taiwanese data sources.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { DateTime } from 'luxon';
import { parallel } from 'async';
import { flatMap } from 'lodash';

const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });

exports.name = 'adairquality-ae';

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

const stations = [
  {
    name: 'Al Ain Islamic Institute',
    coordinates: {
      latitude: 24.219,
      longitude: 55.7348
    },
    slug: 'EAD_AlAinSchool',
    city: 'Al Ain'
  },
  {
    name: 'Al Ain Street',
    coordinates: {
      latitude: 24.22579,
      longitude: 55.76579
    },
    slug: 'EAD_AlAinStreet',
    city: 'Al Ain'
  },
  {
    name: 'Al Mafraq',
    coordinates: {
      latitude: 24.28697,
      longitude: 54.5861
    },
    slug: 'EAD_AlMafraq',
    city: 'Abu Dhabi'
  },
  {
    name: "Al Qua'a",
    coordinates: {
      latitude: 23.53109,
      longitude: 55.48589
    },
    slug: 'EAD_AlQuaa',
    city: 'Al Ain'
  },
  {
    name: 'Al Tawia',
    coordinates: {
      latitude: 24.25909,
      longitude: 55.70479
    },
    slug: 'EAD_AlTawia',
    city: 'Al Ain'
  },
  {
    name: 'Al Maqtaa',
    coordinates: {
      latitude: 24.40349,
      longitude: 54.51599
    },
    slug: 'EAD_AlMaqta',
    city: 'Abu Dhabi'
  },
  {
    name: 'Baniyas School',
    coordinates: {
      latitude: 24.32129,
      longitude: 54.63589
    },
    slug: 'EAD_Baniyas',
    city: 'Abu Dhabi'
  },
  {
    name: 'Bida Zayed',
    coordinates: {
      latitude: 23.652199,
      longitude: 53.70379
    },
    slug: 'EAD_BidaZayed',
    city: 'Abu Dhabi'
  },
  {
    name: 'Zakher',
    coordinates: {
      latitude: 24.16339,
      longitude: 55.70209
    },
    slug: 'EAD_Zakher',
    city: 'Al Ain'
  },
  {
    name: 'Gayathi',
    coordinates: {
      latitude: 23.83549,
      longitude: 52.81029
    },
    slug: 'EAD_Gayathi',
    city: 'Ghiyathi'
  },
  {
    name: 'Sweihan',
    coordinates: {
      latitude: 24.466506,
      longitude: 55.34282475
    },
    slug: 'EAD_Sweihan',
    city: 'Al Ain'
  },
  {
    name: 'Ruwais',
    coordinates: {
      latitude: 24.09079,
      longitude: 52.75479
    },
    slug: 'EAD_RuwaisTransco',
    city: 'Al Ruways Industrial City'
  },
  {
    name: 'Mussafah',
    coordinates: {
      latitude: 24.34715,
      longitude: 54.5028
    },
    slug: 'EAD_Mussafah',
    city: 'Abu Dhabi'
  },
  {
    name: 'Liwa',
    coordinates: {
      latitude: 23.09569,
      longitude: 53.60639
    },
    slug: 'EAD_Liwa',
    city: 'Liwa'
  },
  {
    name: 'Khalifa School',
    coordinates: {
      latitude: 24.4299,
      longitude: 54.408399
    },
    slug: 'EAD_KhalifaSchool',
    city: 'Abu Dhabi'
  },
  {
    name: 'Khalifa City A',
    coordinates: {
      latitude: 24.419899,
      longitude: 54.57809
    },
    slug: 'EAD_KhalifaCity',
    city: 'Abu Dhabi'
  },
  {
    name: 'Khadeeja School',
    coordinates: {
      latitude: 24.48188,
      longitude: 54.369138
    },
    slug: 'EAD_KhadijaSchool',
    city: 'Abu Dhabi'
  },
  {
    name: 'Hamdan Street',
    coordinates: {
      latitude: 24.48889,
      longitude: 54.36369
    },
    slug: 'EAD_HamdanStreet',
    city: 'Abu Dhabi'
  },
  {
    name: 'Habshan South',
    coordinates: {
      latitude: 23.750399,
      longitude: 53.745199
    },
    slug: 'EAD_Habshan',
    city: 'Habshan'
  },
  {
    name: 'E11+Road',
    coordinates: {
      latitude: 24.035099,
      longitude: 53.88529
    },
    slug: 'EAD_E11Road',
    city: 'Abu Al Abyad'
  }
];

exports.fetchData = function (source, cb) {
  /**
   * Given fetched data, turn it into a format our system can use.
   * @param {object} results Fetched source data and other metadata
   * @return {object} Parsed and standarized data our system can use
   */

  const requests = stations.map((station) => {
    return (done) => {
      request(`${source.url}${station.slug}`, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done({
            message: `Failure to load data url (${source.url}${station.slug})`
          });
        }
        let data = Object.assign(station, { body: body }); // add the body to the station object
        return done(null, data);
      });
    };
  });

  parallel(requests, (err, results) => {
    if (err) {
      return cb(err);
    }
    try {
      const data = formatData(results);
      if (data === undefined) {
        return cb({ message: 'Failure to parse data.' });
      }
      return cb(null, data);
    } catch (e) {
      return cb(e);
    }
  });
};

const validParameters = {
  PM10: { value: 'pm10', unit: 'µg/m³' },
  O3: { value: 'o3', unit: 'µg/m³' },
  SO2: { value: 'so2', unit: 'µg/m³' },
  NO2: { value: 'no2', unit: 'µg/m³' },
  CO: { value: 'co', unit: 'mg/m³' }
};

function parseDate (dateString) {
  /**
   * converts the given date string to a timezoned date
   * @param {string} dateString date as string in format 'dd/mm/yyyy hh:mm:ss AM'
   * @return {DateTime} luxon DateTime with the appropriate timezone
   */
  const pattern =
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s(\d{1,2}):(\d{2}):(\d{2})\s([A|P]M)/;
  const regex = new RegExp(pattern);
  const groups = regex.exec(dateString);
  let hour = parseInt(groups[4]);
  const minutes = groups[5];
  const seconds = groups[6];
  if (groups[7] === 'PM' && hour !== 12) {
    hour = hour + 12;
  }
  if (groups[7] === 'AM' && hour === 12) {
    hour = 0;
  }
  hour = hour.toString().padStart(2, '0');
  const d = DateTime.fromISO(
    `${groups[3]}-${groups[1].padStart(2, '0')}-${groups[2].padStart(
      2,
      '0'
    )}T${hour}:${minutes}:${seconds}`,
    {
      zone: 'Asia/Dubai'
    }
  );
  return d;
}

function formatData (locations) {
  let out = [];
  for (const location of locations) {
    const body = JSON.parse(location.body);
    const measurements = JSON.parse(body.JSONDataResult).map((o) => {
      const date = parseDate(o.DateTime);
      o.DateTime = date;
      return o;
    });
    const measurementsSorted = measurements.sort(
      (a, b) => b.DateTime - a.DateTime
    );
    const latestMeasurements = measurementsSorted[0];
    const filtered = Object.entries(latestMeasurements)
      .filter(([key, _]) => {
        return key in validParameters;
      })
      .filter((o) => o[1])
      .map((o) => {
        return {
          parameter: validParameters[o[0]].value,
          unit: validParameters[o[0]].unit,
          value: o[1]
        };
      });
    const data = filtered.map((measurement) => {
      return {
        parameter: measurement.parameter,
        date: {
          utc: latestMeasurements.DateTime,
          local: latestMeasurements.DateTime.toISO({
            suppressMilliseconds: true
          })
        },
        value: measurement.value,
        unit: measurement.unit,
        location: location.name,
        city: location.city,
        coordinates: {
          latitude: location.coordinates.latitude,
          longitude: location.coordinates.longitude
        },
        attribution: [
          {
            name: 'Abu Dhabi Air Quality',
            url: 'https://www.adairquality.ae/'
          }
        ],
        averagingPeriod: { unit: 'hours', value: 1 }
      };
    });
    out.push(data);
  }
  return { name: 'unused', measurements: flatMap(out) };
}
