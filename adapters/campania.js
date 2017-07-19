'use strict';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import Papa from 'babyparse';
import { intersection } from 'lodash';
import { parallel } from 'async';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'campania';

export function fetchData (source, callback) {
  const tasks = generateRequests(source);
  parallel(
    tasks,
    (err, response) => {
      if (err || (response[0] === [] && response[1] === [])) {
        return callback(null, []);
      }
      const measurements = [].concat.apply([], response);
      return callback(null, {name: 'unused', measurements: measurements});
    }
  );
}

const generateRequests = (source) => {
  return [moment().format('YYYYMMDD'), moment().add(1, 'days').format('YYYYMMDD')].map((date) => {
    const url = source.url.replace('<date>', date);
    return (done) => {
      request.get({
        url
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        const data = formatData(body, source);
        return done(null, data);
      });
    };
  });
};

const formatData = (html, source) => {
  let records = Papa.parse(html);
  return records.data.filter((record) => {
    // filter out those records we cannot intersect pollutant types with
    const pollutants = ['CO', 'SO2', 'NO2', 'PM10', 'NO2', 'PM2.5', 'O3'];
    const match = intersection(pollutants, record);
    if (match.length > 0) {
      return record;
    }
  }).map((validRecord) => {
    return {
      parameter: validRecord[2],
      date: makeDate(validRecord[4]),
      coordinates: mapCoordinates(validRecord[0], stations),
      // convert milogram to microgram if neccessary
      value: validRecord[3] === 'mg/m³' ? validRecord[5] * 1000 : validRecord[5],
      unit: validRecord[3] === 'mg/m³' ? 'µg/m³' : validRecord[3],
      attribution: [{
        name: 'Climatological and Meteorological Center',
        url: source.sourceUrl
      }],
      // TODO: find this answer.
      averagingPeriod: {unit: 'hours', value: ''}
    };
  });
};

const makeDate = (date) => {
  date = moment.tz(date, 'YYYY-MM-DDHH:mm:ss', 'Europe/Malta');
  return {
    utc: date.toDate(),
    local: date.format()
  };
};

const mapCoordinates = (place, stations) => {
  return stations.filter((station) => {
    return station.ID === place;
  }).map((correctStation) => {
    return {
      latitude: correctStation.LAT,
      longitude: correctStation.LON
    };
  })[0];
};

const stations = [
  {
    'ID': 'ARPACAMPANIA_ACERRAZI',
    'LAT': 40.9796485901,
    'LON': 14.4009828568,
    'NAME': 'Acerra Zona Industriale'
  },
  {
    'ID': 'ARPACAMPANIA_ALBURNI',
    'LAT': 40.470664978,
    'LON': 15.2986392975,
    'NAME': 'Ottati Alburni'
  },
  {
    'ID': 'ARPACAMPANIA_ALIGHIERI',
    'LAT': 40.9187049866,
    'LON': 14.7854919434,
    'NAME': 'Avellino Scuola Alighieri'
  },
  {
    'ID': 'ARPACAMPANIA_AREAASI',
    'LAT': 40.9208335876,
    'LON': 14.3850002289,
    'NAME': `Pomigliano D'Arco Area ASI`
  },
  {
    'ID': 'ARPACAMPANIA_AV41',
    'LAT': 40.9230537415,
    'LON': 14.7866668701,
    'NAME': 'Avellino AV41 Sc. V Circolo'
  },
  {
    'ID': 'ARPACAMPANIA_BENEVCS',
    'LAT': 41.1157493591,
    'LON': 14.7798948288,
    'NAME': 'Benevento Campo Sportivo'
  },
  {
    'ID': 'ARPACAMPANIA_BENEVZI',
    'LAT': 41.1468429565,
    'LON': 14.8362503052,
    'NAME': 'Benevento Zona Industriale'
  },
  {
    'ID': 'ARPACAMPANIA_BN32',
    'LAT': 41.1313896179,
    'LON': 14.7891664505,
    'NAME': 'Benevento BN32 Via Mustilli'
  },
  {
    'ID': 'ARPACAMPANIA_CAPORALE',
    'LAT': 40.9404602051,
    'LON': 14.3701972961,
    'NAME': 'Acerra Scuola Caporale'
  },
  {
    'ID': 'ARPACAMPANIA_CASORIA',
    'LAT': 40.9146308899,
    'LON': 14.2986059189,
    'NAME': 'Casoria Scuola Palizzi'
  },
  {
    'ID': 'ARPACAMPANIA_CE51',
    'LAT': 41.0786094666,
    'LON': 14.3383331299,
    'NAME': 'Caserta CE51 Ist.Manzoni'
  },
  {
    'ID': 'ARPACAMPANIA_CE52',
    'LAT': 41.076915741,
    'LON': 14.3312501907,
    'NAME': 'Caserta CE52 Sc. De Amicis'
  },
  {
    'ID': 'ARPACAMPANIA_CE54',
    'LAT': 41.0459289551,
    'LON': 14.3780832291,
    'NAME': 'Maddaloni CE54 Sc. Settembrini'
  },
  {
    'ID': 'ARPACAMPANIA_CIRILLO',
    'LAT': 40.9754981995,
    'LON': 14.2114162445,
    'NAME': 'Aversa Sc. Cirillo'
  },
  {
    'ID': 'ARPACAMPANIA_CS',
    'LAT': 40.9904327393,
    'LON': 14.423989296,
    'NAME': 'S. Felice a Cancello C. Scolast.'
  },
  {
    'ID': 'ARPACAMPANIA_MARCONI',
    'LAT': 40.9244270325,
    'LON': 14.4814472198,
    'NAME': 'S.Vitaliano Scuola Marconi'
  },
  {
    'ID': 'ARPACAMPANIA_MATESE',
    'LAT': 41.4183616638,
    'LON': 14.412027359,
    'NAME': 'S.Gregorio Matese Lago'
  },
  {
    'ID': 'ARPACAMPANIA_MERC',
    'LAT': 40.6616401672,
    'LON': 14.8045139313,
    'NAME': 'Salerno Parco Mercatello'
  },
  {
    'ID': 'ARPACAMPANIA_NA01',
    'LAT': 40.8636932373,
    'LON': 14.2545108795,
    'NAME': 'Napoli NA01 Oss. Astronomico'
  },
  {
    'ID': 'ARPACAMPANIA_NA02',
    'LAT': 40.8491668701,
    'LON': 14.2311115265,
    'NAME': 'Napoli NA02 Osp. Santobono'
  },
  {
    'ID': 'ARPACAMPANIA_NA06',
    'LAT': 40.8541679382,
    'LON': 14.2511110306,
    'NAME': 'Napoli NA06 Museo Nazionale'
  },
  {
    'ID': 'ARPACAMPANIA_NA07',
    'LAT': 40.8541679382,
    'LON': 14.2716665268,
    'NAME': 'Napoli NA07 Ferrovia'
  },
  {
    'ID': 'ARPACAMPANIA_NA08',
    'LAT': 40.8725013733,
    'LON': 14.2827777863,
    'NAME': 'Napoli NA08 Osp.N.Pellegrini'
  },
  {
    'ID': 'ARPACAMPANIA_NA09',
    'LAT': 40.8638877869,
    'LON': 14.3413887024,
    'NAME': 'Napoli NA09 Via Argine'
  },
  {
    'ID': 'ARPACAMPANIA_NA10',
    'LAT': 40.7986679077,
    'LON': 14.1797218323,
    'NAME': 'Napoli Parco Virgiliano'
  },
  {
    'ID': 'ARPACAMPANIA_PARCOF',
    'LAT': 40.6110839844,
    'LON': 14.9758615494,
    'NAME': 'Battipaglia Parco Fiume'
  },
  {
    'ID': 'ARPACAMPANIA_PASCOLI',
    'LAT': 40.7604980469,
    'LON': 14.4381332397,
    'NAME': 'Torre Annunziata Sc. Pascoli'
  },
  {
    'ID': 'ARPACAMPANIA_POLLA',
    'LAT': 40.4880828857,
    'LON': 15.5200834274,
    'NAME': 'Polla Area Ritovagliatore'
  },
  {
    'ID': 'ARPACAMPANIA_PR',
    'LAT': 40.8159713745,
    'LON': 14.3502502441,
    'NAME': 'Portici Parco Reggia'
  },
  {
    'ID': 'ARPACAMPANIA_SA22',
    'LAT': 40.682220459,
    'LON': 14.7661113739,
    'NAME': 'Salerno SA22 Osp. Via Vernieri'
  },
  {
    'ID': 'ARPACAMPANIA_SA23',
    'LAT': 40.6952781677,
    'LON': 14.7775001526,
    'NAME': 'Salerno SA23 Scuola Conti'
  },
  {
    'ID': 'ARPACAMPANIA_SOLIMENA',
    'LAT': 40.7402496338,
    'LON': 14.6434669495,
    'NAME': 'Nocera Inferiore Sc. Solimena'
  },
  {
    'ID': 'ARPACAMPANIA_SOLOFRAZI',
    'LAT': 40.8355560303,
    'LON': 14.8249998093,
    'NAME': 'Solofra Zona Industriale'
  },
  {
    'ID': 'ARPACAMPANIA_STADIO',
    'LAT': 40.710975647,
    'LON': 14.7024440765,
    'NAME': 'Cava dei Tirreni Stadio'
  },
  {
    'ID': 'ARPACAMPANIA_VILLAAV',
    'LAT': 40.8228759766,
    'LON': 14.1224365234,
    'NAME': 'Pozzuoli Zona Villa Avellino'
  },
  {
    'ID': 'ARPACAMPANIA_VILLACOM',
    'LAT': 41.1563072205,
    'LON': 15.0965003967,
    'NAME': 'Ariano Irpino Stadio'
  }
];
