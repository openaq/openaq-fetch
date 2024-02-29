'use strict';

import { acceptableParameters } from '../lib/utils.js';
import log from '../lib/logger.js';

import { DateTime } from 'luxon';
import { load } from 'cheerio';
import client from '../lib/requests.js';

export const name = 'stockholm';

export function fetchData (source, cb) {
  client(source.url)
    .then(response => {
      try {
        if (response.statusCode !== 200) {
          throw new Error('Failure to load data url.');
        }

        // Format the data
        const data = formatData(response.body);
        // Make sure the data is valid
        if (data === undefined) {
          throw new Error('Failure to parse data.');
        }

        cb(null, data);
      } catch (error) {
        log.debug(error);
        cb(error, { message: 'Unknown adapter error.' }, null);
      }
    });
}

const formatData = function (result) {
  const measurements = [];

  // Source: Hardcoded in source-code in http://slb.nu/slbanalys/matningar/
  const getCoordinates = function (id) {
    switch (id) {
      case 'Högdalen':
        return { latitude: 59.26086482, longitude: 18.06166762 };
      case 'Gävle Södra Kungsgatan':
        return { latitude: 60.67155223, longitude: 17.14691497 };
      case '59.83238423, 18.63132007':
        return { latitude: 59.83238423, longitude: 18.63132007 };
      case 'Brännkyrkaskolan':
        return { latitude: 59.30426591, longitude: 18.0176204 };
      case 'Töjnaskolan':
        return { latitude: 59.42370559, longitude: 17.92887634 };
      case 'Norr Malma (regional bakgrund)':
      case 'Regional bakgrund (Norr Malma)':
        return { latitude: 59.83171574, longitude: 18.63317244 };
      case 'Torkel Knutssonsgatan (tak)':
        return { latitude: 59.3160056, longitude: 18.0578016 };
      case 'Uppsala Marsta':
        return { latitude: 59.92596545, longitude: 17.58700716 };
      case 'E4':
        return { latitude: 59.48583073, longitude: 17.91964065 };
      case 'Hornsgatan':
        return { latitude: 59.31713214, longitude: 18.04878744 };
      case 'Sveavägen':
        return { latitude: 59.34516113, longitude: 18.05428175 };
      case 'Folkungagatan':
        return { latitude: 59.31462368, longitude: 18.07585555 };
      case 'Hågelbyleden Botkyrka':
        return { latitude: 59.23705806, longitude: 17.83833241 };
      case 'Gröndalsskolan':
        return { latitude: 59.31349142, longitude: 18.00469473 };
      case 'Fleminggatan (projekt)':
        return { latitude: 59.33375997, longitude: 18.03684915 };
      case 'E4 Sollentuna Häggvik':
        return { latitude: 59.44353901, longitude: 17.92236122 };
      case 'Norrlandsgatan':
        return { latitude: 59.33635627, longitude: 18.07062632 };
      case 'Södertälje Turingegatan':
        return { latitude: 59.19812352, longitude: 17.62108719 };
      case 'Ekmansväg':
        return { latitude: 59.48900019, longitude: 17.92020954 };
      case 'Eriksbergsskolan':
        return { latitude: 59.41018492, longitude: 17.95779851 };
      case 'Falun, Svärdsjögatan':
        return { latitude: 60.60798503, longitude: 15.63367903 };
      case 'Södertalje, Birkakorset':
        return { latitude: 59.20135294, longitude: 17.63475503 };
      case 'E4/E20 Lilla Essingen':
      case 'Lilla Essingen (E4/E20)':
        return { latitude: 59.32551867, longitude: 18.00396061 };
      case 'Uppsala Kungsgatan':
        return { latitude: 59.85953006, longitude: 17.64248414 };
      case 'Urban bakgrund (Uppsala)':
        return { latitude: 59.86046, longitude: 17.63789 };
      case 'Urban bakgrund (Stockholm)':
        return { latitude: 59.315891, longitude: 18.057991 };
      case 'Sankt Eriksgatan':
        return { latitude: 59.338921, longitude: 18.035773 };
      case 'Solna Råsundavägen':
        return { latitude: 59.362291, longitude: 17.992711 };
      case 'Sollentuna Danderydsvägen':
        return { latitude: 59.44575, longitude: 17.952473 };
      case 'Botkyrka Hågelbyleden':
        return { latitude: 59.236914, longitude: 17.838365 };
      case 'Sollentuna Häggvik (E4)':
        return { latitude: 59.44358, longitude: 17.922494 };
      case 'Skonertvägen (E4/E20)':
        return { latitude: 59.313251, longitude: 18.00388 };
      case 'St Erikgsgatan':
        return { latitude: 59.3387558, longitude: 18.0357015 };
      case 'Råsndavägen, Solna':
        return { latitude: 59.3659396, longitude: 17.9995942 };
      case 'Tulegatan, Sundbyberg':
        return { latitude: 59.3667459, longitude: 17.9688665 };
      case 'Danderydsvägen':
        return { latitude: 59.4081664, longitude: 18.0636322 };
      case 'Kungsgatan, Uppsala':
        return { latitude: 59.853185, longitude: 17.653329 };
      case 'Kungsgatan, Norrköping':
        return { latitude: 58.590397, longitude: 16.178606 };
      case 'Hamngatan, Linköping':
        return { latitude: 58.40878, longitude: 15.631343 };
      case 'Österväg, Visby':
        return { latitude: 57.637377, longitude: 18.301129 };
      case 'St Eriksgatan':
        return { latitude: 59.334351, longitude: 18.031951 };
      case 'Valhallavägen':
        return { latitude: 59.348618, longitude: 18.062386 };
      case 'Råsundavägen':
        return { latitude: 59.363839, longitude: 18.019706 };
      case 'Tulegatan':
        return { latitude: 60.605031, longitude: 16.762106 };
      case 'Kungsgatan, Gävle':
        return { latitude: 59.363839, longitude: 18.019706 };
      default:
        return undefined;
    }
  };

  // Load the html into Cheerio
  const $ = load(result, { decodeEntities: false });
  const items = {};
  $('.entry-content').each(function () {
    const rendered = $(this).html();
    acceptableParameters.forEach((pollutant) => {
      ['col1', 'col2'].forEach((col) => {
        const strFind = `document.getElementById("${pollutant}_${col}").innerHTML =`;
        rendered.split('\n').forEach((line) => {
          if (line.indexOf(strFind) > -1) {
            const htmlFind = line.replace(strFind, '');
            const c$ = load(htmlFind);
            const values = c$.text().split('█');
            if (items[pollutant]) {
              items[pollutant] = items[pollutant].concat(values);
            } else {
              items[pollutant] = values;
            }
          }
        });
      });
    });
  });

  for (const [parameter, values] of Object.entries(items)) {
    let date;
    for (let index = 0; index < values.length; index++) {
      const itemValue = values[index];
      if (index === 0) {
        const dateRe = /\((.*)\)/g;
        const siteDate = dateRe
          .exec(itemValue)[1]
          .trim()
          .replace(/ /g, '')
          .split('kl.');
        let dateLuxon = DateTime.fromFormat(siteDate[1].trim(), 'HH:mm', {
          zone: 'Europe/Stockholm'
        });
        dateLuxon = dateLuxon.set({ day: DateTime.local().day });
        date = {
          utc: dateLuxon
            .toUTC()
            .toISO({ suppressMilliseconds: true }),
          local: dateLuxon.toISO({ suppressMilliseconds: true }),
        };
      } else {
        // Remove empty values
        if (itemValue.length > 2) {
          let measurement = itemValue.trim().split(':').pop();
          const location = itemValue
            .replace(measurement, '')
            .replace(/:/g, '')
            .trim();
          let city = 'Stockholm';
          if (location.includes('Uppsala')) city = 'Uppsala';
          if (location.includes('Gävle')) city = 'Gävle';
          measurement = measurement
            .replace('ug/m3', '')
            .trim()
            .replace(/"/g, '');

          const base = {
            location,
            city: city,
            attribution: [
              {
                name: 'SLB',
                url: 'http://slb.nu/slbanalys/luften-idag/',
              },
            ],
            averagingPeriod: { value: 1, unit: 'hours' },
            coordinates: getCoordinates(location),
            date,
            parameter,
            value: parseFloat(measurement.trim()),
            unit: 'µg/m³',
          };

          if (!isNaN(base.value) && base.coordinates) {
            measurements.push(base);
          } else {
            log.debug(`Unable to load data for ${base.location}`);
          }
        }
      }
    }
  }
  return { name: 'unused', measurements: measurements };
};
