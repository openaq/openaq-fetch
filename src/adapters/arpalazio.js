'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants.js';
import { FetchError, DATA_URL_ERROR, DATA_PARSE_ERROR } from '../lib/errors.js';
import log from '../lib/logger.js';
import { acceptableParameters, convertUnits } from '../lib/utils.js';
import { default as baseRequest } from 'request';
import { default as rp } from 'request-promise-native';
import { DateTime } from 'luxon';
import sj from 'scramjet';
const { StringStream, MultiStream } = sj;

import cheerio from 'cheerio';
import difference from 'lodash/difference.js';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'arpalazio';
const timezone = 'Europe/Rome';

const baseUrl = 'http://www.arpalazio.net/main/aria/sci/annoincorso/';
const provinceQueryPath = 'chimici/chimici.php';
const hourlyAvgParam = 0;
const dailyAvgParam = 3;
const hourlyAvgPeriod = {unit: 'hours', value: 1};
const dailyAvgPeriod = {unit: 'hours', value: 24};
const dailyParameters = ['pm25', 'pm10'];
const hourlyParameters = difference(acceptableParameters, dailyParameters);

export async function fetchStream (source) {
  const response = await rp({method: 'GET', uri: source.url, resolveWithFullResponse: true, timeout: REQUEST_TIMEOUT});

  if (response.statusCode !== 200) {
    throw new FetchError(DATA_URL_ERROR, source, null);
  }

  let $;
  try {
    $ = cheerio.load(response.body);
  } catch (e) {
    throw new FetchError(DATA_PARSE_ERROR, source, e);
  }

  const provinces = $('#provincia option')
    .filter(function (i, el) {
      return parseFloat($(this).attr('value')) >= 0;
    })
    .map(function (i, el) {
      return { id: $(this).attr('value'), name: $(this).text() };
    }).get();

  const out = new MultiStream();
  provinces.forEach(
    async province => {
      const provinceHourlyURL = `${baseUrl}${provinceQueryPath}?provincia=${province.id}&dati=${hourlyAvgParam}`;
      const provinceDailyURL = `${baseUrl}${provinceQueryPath}?provincia=${province.id}&dati=${dailyAvgParam}`;

      out.add(await handleProvince(province.name, provinceHourlyURL, hourlyAvgPeriod, source));
      out.add(await handleProvince(province.name, provinceDailyURL, dailyAvgPeriod, source));
    }
  );

  return out.mux();
};

const handleProvince = async function (name, url, averagingPeriod, source) {
  const response = await rp({method: 'GET', uri: url, resolveWithFullResponse: true, timeout: REQUEST_TIMEOUT});

  if (response.statusCode !== 200) {
    throw new FetchError(DATA_PARSE_ERROR, source, null);
  }
  log.verbose(`Loading province information from ${url}`);

  const $ = cheerio.load(response.body);
  const pollutantURLs = $('a').map(function () {
    const pollutant = $(this).text().toLowerCase().replace('.', '');
    const currentParameters = getParameters(averagingPeriod);
    if (currentParameters.indexOf(pollutant) >= 0) {
      const href = $(this).attr('href');
      return `${baseUrl}${href}`;
    }
  }).get();

  const arrayOfPromises = pollutantURLs.map(dataUrl => getStream(name, dataUrl, averagingPeriod, source, url));

  return new MultiStream(
    await Promise.all(arrayOfPromises)
      .catch((err) => {
        log.verbose(`Promise error ${err}`);
        return arrayOfPromises;
      })
  ).mux();
};

const getParameters = function (averagingPeriod) {
  switch (averagingPeriod.value) {
    case 1:
      return hourlyParameters;
    case 24:
      return dailyParameters;
    default:
      return [];
  }
};

export const getStream = function (cityName, url, averagingPeriod, source, orgUrl) {
  const { metadata } = source;
  const match = url.match(/[\w]{2}_([\w.]{2,})_([\d]{4})(?:_gg)?.txt/);
  if (!match || match.length < 2) {
    log.verbose(`Failed to match url ${url}`);
  }
  const parameter = match[1].toLowerCase().replace('.', '');
  const year = match[2];
  const unit = getUnit(parameter);
  const dayPosition = averagingPeriod.value === 1 ? 0 : 1;

  const fewDaysAgo = +parseFloat(DateTime.local().setZone(timezone).minus({days: 4}).ordinal);
  log.verbose(`Fetching data from ${url}`);

  const stations = {};
  return StringStream.from(
    request(url)
  )
    .lines(StringStream.SPLIT_LINE)
    .map(x => x.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''))
    .parse(
      row =>
        row
          .trim()
          .split(/\s+/g)
    )
    .shift(1, ([header]) => {
      header
        .slice(2)
        .forEach((x, i) => {
          if (+x && Object.keys(metadata).indexOf(x) > -1) {
            stations[i] = Object.assign(metadata[x]);
          }
        });
    })
    .filter(x => x[dayPosition] >= fewDaysAgo)
    .map(
      ([date1, date2, ...x]) => {
        const timestamp = (averagingPeriod.value === 1)
          ? DateTime.fromObject({year, ordinal: date1, hour: date2}).setZone(timezone)
          : DateTime.fromObject({year, ordinal: date2}).setZone(timezone);

        const date = {
          utc: timestamp.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
          local: timestamp.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ")
        };

        const base = {
          date,
          averagingPeriod,
          city: cityName,
          attribution: [{
            name: source.name,
            url: source.sourceURL
          }]
        };

        return x
          .map(x => +x)
          .map(
            (value, i) => {
              if (value <= -999 || !stations[i]) return;

              const { name, longitude, latitude } = stations[i];

              return Object.assign({}, base, {
                unit,
                value,
                parameter,
                location: name,
                coordinates: {
                  longitude,
                  latitude
                }
              });
            }
          )
          .filter(x => x)
        ;
      }
    )
    .flatMap(measurements => convertUnits(measurements))
  ;
};

const getUnit = function (parameter) {
  // unit mapping described in
  // http://www.arpalazio.net/main/aria/sci/annoincorso/LegendaDatiChimici.pdf
  switch (parameter) {
    case 'co':
      return 'mg/m3';
    default:
      return 'µg/m3';
  }
};
