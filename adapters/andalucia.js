'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import cheerio from 'cheerio';
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import async from 'async';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'andalucia';

export function fetchData (source, callback) {
  let baseUrl = source.url;
  // see if site is available. if so, build tasks, then run them in parallel
  request(baseUrl, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return callback({message: 'Failed to load entry point url'});
    }
    // get provinces from form on source.url.
    // use them to make taskObjs with name/id.
    // this is helpful for descriptive error logs and using the coordinates csv
    let $ = cheerio.load(body);
    let tasks = [];
    $('select[name=PROVINCIA]').children().filter((i, el) => {
      tasks.push({
        provinceName: $(el).text(),
        provinceID: $(el)['0'].attribs.value
      });
    });
    const now = moment();
    // generate list of tasks
    tasks = tasks.map((task) => {
      let url = source.sourceURL + `${now.format('MMM').toLowerCase() + now.format('YY')}/n${task.provinceID + now.format('YYMMDD')}.htm`;
      return generateTasks(url, task, now);
    });
    // execute in parallel
    async.parallel(
      tasks,
      (err, results) => {
        if (err) {
          return callback(null, err);
        }
        return callback(null, results);
      }
    );
  });
}
//
const generateTasks = (url, task, now) => {
  return (done) => {
    // Try getting data from today and yesterday
      // in both cases, if unsuccessful, return blank list
      // when successful, return list of parsed data.
    async.parallel([
      (cb) => {
        request.get(
          url, (err, res, body) => {
            if (err || res.statusCode !== 200) {
              console.log(
                'Records for ' + moment().format('DD-MM-YY') +
                ' not reached.'
              );
              return cb(null, []);
            }
            let $ = cheerio.load(body);
            const data = formatData($, stations);
            return cb(null, data);
          }
        );
      },
      (cb) => {
        url = url.replace(now.format('YYMMDD'), moment().add(-1, 'days').format('YYMMDD'));
        request.get(
          url, (err, res, body) => {
            if (err || res.statusCode !== 200) {
              console.log(
                'Records for ' + moment().add(-1, 'days').format('DD-MM-YY') +
                'not reached.'
              );
              return cb(null, []);
            }
            let $ = cheerio.load(body);
            const data = formatData($, stations);
            cb(null, data);
          }
       );
      }], (err, res) => {
      if (err) {
        return done(null, []);
      }
      res = res[0].concat(res[1]);
      done(null, res);
    }
  );
  };
};


const formatData = ($, stations) => {
  const tables = [];
  // the tables we want don't have cellpadding 5.
  $('table').each((i, el) => {
    const table = $(el)['0'];
    if (table.attribs.cellpadding !== '5') {
      tables.push($(el));
    }
  });
  // data is held two consecutive tables
  // (one with station name, other actual data)
  let stationData = _.chunk(tables, 2);
  // return a list of measurement objects for each table.
  return stationData.map((table) => {
    const station = $(table[0]['0'].children[2]).text().split('Estacion')[1].trim();
    const stationLoc = mapStationCoords(station);
    table = makeTable(table[1]['0'], $);
    return makeMeasurements(table, stationLoc);
  });
};

const mapStationCoords = (station) => {
  return stations.filter((stationObj) => {
    return stationObj['ESTACION'] === station;
  }).map((stationObj) => {
    // TODO: figure out places' utm zome, then use utm.js to convert to wgs84
    return {
      longitude: stationObj.UTMx,
      latitude: stationObj.UTMy
    };
  });
};

const makeTable = (cheerioTable, $) => {
  return cheerioTable.children.filter((child) => {
    return child.name === 'tr';
  }).map((row) => {
    const tds = [];
    $(row).children().each((i, el) => {
      tds.push($(el).text());
    });
    return tds;
  });
};

const makeMeasurements = (stationData, stationLoc) => {
  // get index of data sources we can record
  const pollutantIndexes = stationData[0].filter((cell) => {
    return _.includes(['SO2', 'NO2'], cell);
  }).map((validCell) => {
    return stationData[0].indexOf(validCell);
  });
  // include index for 1st column, which has the date
  pollutantIndexes.push(0);
  // filter rows for only the date,SO2, and NO2 rows
  stationData = stationData.map((row) => {
    return row.filter((cell, index) => {
      if (_.includes(pollutantIndexes, index)) {
        return cell;
      }
    });
  });
  // make each row into a list of measurements
  stationData = stationData.slice(1, -1).map((row, index) => {
    return row.map((cell, index) => {
      if (index !== 0) {
        return {
          parameter: stationData[0][index],
          date: makeDate(row[0]),
          coordinates: stationLoc,
          value: cell,
          unit: 'µg/m³',
          attribution: [{
            name: 'Ministry of Environment and Spatial Planning',
            url: 'http://www.juntadeandalucia.es/medioambiente/site/portalweb'
          }],
          averagingPeriod: {
            unit: 'hours',
            // averaging period gathered from source.url
            value: stationData[0][index] === 'S02' ? 24 : 1
          }
        };
      }
    }).filter((cell) => {
      if (cell !== undefined) {
        return cell;
      }
    });
  });
  // merge all measurement lists into one
  return [].concat.apply([], stationData);
};

const makeDate = (date) => {
  // format is reported as MM/DD/YY-HH:MM.
  // to andle this, it isso it's split on -'.
  // then the base date is formatted so it is valid for moment.
  // then the two sides are joined back together on a ' '.
  const baseDate = date.split('-')[0]
    .split('/')
    .reverse()
    .map((element, index) => {
      if (index === 0) {
        return '20' + element;
      } else {
        return element;
      }
    }).join('-');
  date = moment.tz(
    baseDate + ' ' + date.split('-')[1],
    'YYYY/MM/DD HH:mm:ss',
    'Europe/Gibraltar'
  );
  return {
    utc: date.toDate(),
    local: date.format()
  };
};

const stations = [
  {
    'num': 1,
    'ESTACION': 'EL BOTICARIO',
    'MUNICIPIO': 'ALMERÍA',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 554327,
    'UTMy': 4080065
  },
  {
    'num': 2,
    'ESTACION': 'MEDITERRANEO',
    'MUNICIPIO': 'ALMERÍA',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 549331,
    'UTMy': 4077414
  },
  {
    'num': 3,
    'ESTACION': 'BEDAR',
    'MUNICIPIO': 'BÉDAR',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 590047,
    'UTMy': 4116812
  },
  {
    'num': 4,
    'ESTACION': 'BENAHADUX',
    'MUNICIPIO': 'BENAHADUX',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 547809,
    'UTMy': 4086476
  },
  {
    'num': 5,
    'ESTACION': 'CARBONERAS',
    'MUNICIPIO': 'CARBONERAS',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 598587,
    'UTMy': 4095385
  },
  {
    'num': 6,
    'ESTACION': 'T.M. CTLA (SUP)',
    'MUNICIPIO': 'CARBONERAS',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 597461,
    'UTMy': 4093028
  },
  {
    'num': 7,
    'ESTACION': 'T.M. CTLA (10 MTS)',
    'MUNICIPIO': 'CARBONERAS',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 597461,
    'UTMy': 4093028
  },
  {
    'num': 8,
    'ESTACION': 'T.M. CTLA (30 MTS)',
    'MUNICIPIO': 'CARBONERAS',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 597461,
    'UTMy': 4093028
  },
  {
    'num': 9,
    'ESTACION': 'T.M. CTLA (60 MTS)',
    'MUNICIPIO': 'CARBONERAS',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 597461,
    'UTMy': 4093028
  },
  {
    'num': 10,
    'ESTACION': 'PZA. DEL CASTILLO',
    'MUNICIPIO': 'CARBONERAS',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 598293,
    'UTMy': 4095086
  },
  {
    'num': 11,
    'ESTACION': 'PALOMARES',
    'MUNICIPIO': 'CUEVAS DEL ALMANZORA',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 608036,
    'UTMy': 4123853
  },
  {
    'num': 12,
    'ESTACION': 'T.M. VILLARICOS',
    'MUNICIPIO': 'CUEVAS DEL ALMANZORA',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 609489,
    'UTMy': 4124293
  },
  {
    'num': 13,
    'ESTACION': 'VILLARICOS',
    'MUNICIPIO': 'CUEVAS DEL ALMANZORA',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 609007,
    'UTMy': 4123562
  },
  {
    'num': 14,
    'ESTACION': 'EL EJIDO',
    'MUNICIPIO': 'EL EJIDO',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 516870,
    'UTMy': 4069344
  },
  {
    'num': 15,
    'ESTACION': 'MOJACAR',
    'MUNICIPIO': 'MOJÁCAR',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 602830,
    'UTMy': 4110897
  },
  {
    'num': 16,
    'ESTACION': 'CAMPOHERMOSO',
    'MUNICIPIO': 'NÍJAR',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 577638,
    'UTMy': 4087889
  },
  {
    'num': 17,
    'ESTACION': 'RODALQUILAR',
    'MUNICIPIO': 'NÍJAR',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 585750,
    'UTMy': 4078382
  },
  {
    'num': 18,
    'ESTACION': 'LA JOYA',
    'MUNICIPIO': 'NÍJAR',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 592465,
    'UTMy': 4089830
  },
  {
    'num': 19,
    'ESTACION': 'FERNAN PEREZ',
    'MUNICIPIO': 'NÍJAR',
    'PROVINCIA': 'ALMERÍA',
    'UTMx': 584936,
    'UTMy': 4083660
  },
  {
    'num': 20,
    'ESTACION': 'ALGAR',
    'MUNICIPIO': 'ALGAR',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 262092,
    'UTMy': 4059306
  },
  {
    'num': 21,
    'ESTACION': 'E4: RINCONCILLO',
    'MUNICIPIO': 'ALGECIRAS',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 280289,
    'UTMy': 4004653
  },
  {
    'num': 22,
    'ESTACION': 'ALGECIRAS EPS',
    'MUNICIPIO': 'ALGECIRAS',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 279239,
    'UTMy': 4001847
  },
  {
    'num': 23,
    'ESTACION': 'ARCOS',
    'MUNICIPIO': 'ARCOS DE LA FRONTERA',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 255018,
    'UTMy': 4069513
  },
  {
    'num': 24,
    'ESTACION': 'JÉDULA',
    'MUNICIPIO': 'ARCOS DE LA FRONTERA',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 239184,
    'UTMy': 4070198
  },
  {
    'num': 25,
    'ESTACION': 'T.M. ARCOS',
    'MUNICIPIO': 'ARCOS DE LA FRONTERA',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 248497,
    'UTMy': 4061871
  },
  {
    'num': 26,
    'ESTACION': 'Avda. MARCONI',
    'MUNICIPIO': 'CÁDIZ',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 207258,
    'UTMy': 4045046
  },
  {
    'num': 27,
    'ESTACION': 'CARTUJA',
    'MUNICIPIO': 'JEREZ',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 221619,
    'UTMy': 4061772
  },
  {
    'num': 28,
    'ESTACION': 'JEREZ-CHAPIN',
    'MUNICIPIO': 'JEREZ',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 221473,
    'UTMy': 4064853
  },
  {
    'num': 29,
    'ESTACION': 'E7: EL ZABAL',
    'MUNICIPIO': 'LA LÍNEA DE LA CONCEPCIÓN',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 289371,
    'UTMy': 4005695
  },
  {
    'num': 30,
    'ESTACION': 'LA LINEA',
    'MUNICIPIO': 'LA LÍNEA DE LA CONCEPCIÓN',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 288757,
    'UTMy': 4004181
  },
  {
    'num': 31,
    'ESTACION': 'E1: COLEGIO LOS BARRIOS',
    'MUNICIPIO': 'LOS BARRIOS',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 276184,
    'UTMy': 4007408
  },
  {
    'num': 32,
    'ESTACION': 'E2: ALCORNOCALES',
    'MUNICIPIO': 'LOS BARRIOS',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 260630,
    'UTMy': 4013178
  },
  {
    'num': 33,
    'ESTACION': 'E5: PALMONES',
    'MUNICIPIO': 'LOS BARRIOS',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 281205,
    'UTMy': 4006069
  },
  {
    'num': 34,
    'ESTACION': 'T.M.-CTLB(15MTS)',
    'MUNICIPIO': 'LOS BARRIOS',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 282663,
    'UTMy': 4006747
  },
  {
    'num': 35,
    'ESTACION': 'LOS BARRIOS',
    'MUNICIPIO': 'LOS BARRIOS',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 276884,
    'UTMy': 4006254
  },
  {
    'num': 36,
    'ESTACION': 'CORTIJILLOS',
    'MUNICIPIO': 'LOS BARRIOS',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 280980,
    'UTMy': 4007826
  },
  {
    'num': 37,
    'ESTACION': 'PRADO REY',
    'MUNICIPIO': 'PRADO DEL REY',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 274120,
    'UTMy': 4075065
  },
  {
    'num': 38,
    'ESTACION': 'RIO SAN PEDRO',
    'MUNICIPIO': 'PUERTO REAL',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 211209,
    'UTMy': 4046780
  },
  {
    'num': 39,
    'ESTACION': 'SAN FERNANDO',
    'MUNICIPIO': 'SAN FERNANDO',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 212959,
    'UTMy': 4039808
  },
  {
    'num': 40,
    'ESTACION': 'E3: COLEGIO CARTEYA',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 285021,
    'UTMy': 4009758
  },
  {
    'num': 41,
    'ESTACION': 'E6: ESTACION DE FFCC S. ROQUE',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 281534,
    'UTMy': 4010206
  },
  {
    'num': 42,
    'ESTACION': 'CAMPAMENTO',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 286237,
    'UTMy': 4006469
  },
  {
    'num': 43,
    'ESTACION': 'E. DE HOSTELERIA',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 285698,
    'UTMy': 4009196
  },
  {
    'num': 44,
    'ESTACION': 'ECONOMATO',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 285910,
    'UTMy': 4007229
  },
  {
    'num': 45,
    'ESTACION': 'GUADARRANQUE',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 283147,
    'UTMy': 4006841
  },
  {
    'num': 46,
    'ESTACION': 'MADREVIEJA',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 283811,
    'UTMy': 4009303
  },
  {
    'num': 47,
    'ESTACION': 'T. M. CEPSA (10 MTS)',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 284174,
    'UTMy': 4008114
  },
  {
    'num': 48,
    'ESTACION': 'T. M. CEPSA (60 MTS)',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 284174,
    'UTMy': 4008114
  },
  {
    'num': 49,
    'ESTACION': 'PUENTE MAYORGA',
    'MUNICIPIO': 'SAN ROQUE',
    'PROVINCIA': 'CÁDIZ',
    'UTMx': 285741,
    'UTMy': 4006559
  },
  {
    'num': 50,
    'ESTACION': 'LEPANTO',
    'MUNICIPIO': 'CÓRDOBA',
    'PROVINCIA': 'CÓRDOBA',
    'UTMx': 345040,
    'UTMy': 4195364
  },
  {
    'num': 51,
    'ESTACION': 'PARQUE JOYERO',
    'MUNICIPIO': 'CÓRDOBA',
    'PROVINCIA': 'CÓRDOBA',
    'UTMx': 340299,
    'UTMy': 4193525
  },
  {
    'num': 52,
    'ESTACION': 'AVDA. AL-NASIR',
    'MUNICIPIO': 'CÓRDOBA',
    'PROVINCIA': 'CÓRDOBA',
    'UTMx': 343476,
    'UTMy': 4195292
  },
  {
    'num': 53,
    'ESTACION': 'POBLADO',
    'MUNICIPIO': 'ESPIEL',
    'PROVINCIA': 'CÓRDOBA',
    'UTMx': 331073,
    'UTMy': 4219567
  },
  {
    'num': 54,
    'ESTACION': 'OBEJO',
    'MUNICIPIO': 'OBEJO',
    'PROVINCIA': 'CÓRDOBA',
    'UTMx': 342092,
    'UTMy': 4222045
  },
  {
    'num': 55,
    'ESTACION': 'VILLAHARTA',
    'MUNICIPIO': 'VILLAHARTA',
    'PROVINCIA': 'CÓRDOBA',
    'UTMx': 333143,
    'UTMy': 4222831
  },
  {
    'num': 56,
    'ESTACION': 'CIUDAD DEPORTIVA',
    'MUNICIPIO': 'ARMILLA',
    'PROVINCIA': 'GRANADA',
    'UTMx': 444999,
    'UTMy': 4110090
  },
  {
    'num': 57,
    'ESTACION': 'PALACIO DE CONGRESOS',
    'MUNICIPIO': 'GRANADA',
    'PROVINCIA': 'GRANADA',
    'UTMx': 446721,
    'UTMy': 4113421
  },
  {
    'num': 58,
    'ESTACION': 'GRANADA-NORTE',
    'MUNICIPIO': 'GRANADA',
    'PROVINCIA': 'GRANADA',
    'UTMx': 445628,
    'UTMy': 4116803
  },
  {
    'num': 59,
    'ESTACION': 'MOTRIL',
    'MUNICIPIO': 'MOTRIL',
    'PROVINCIA': 'GRANADA',
    'UTMx': 453818,
    'UTMy': 4066501
  },
  {
    'num': 60,
    'ESTACION': 'MATALASCA�AS',
    'MUNICIPIO': 'ALMONTE',
    'PROVINCIA': 'HUELVA',
    'UTMx': 182328,
    'UTMy': 4102622
  },
  {
    'num': 61,
    'ESTACION': 'ROMERALEJO',
    'MUNICIPIO': 'HUELVA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 152450,
    'UTMy': 4131724
  },
  {
    'num': 62,
    'ESTACION': 'CAMPUS EL CARMEN',
    'MUNICIPIO': 'HUELVA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 151975,
    'UTMy': 4132214
  },
  {
    'num': 63,
    'ESTACION': 'LA ORDEN',
    'MUNICIPIO': 'HUELVA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 150819,
    'UTMy': 4133169
  },
  {
    'num': 64,
    'ESTACION': 'LOS ROSALES',
    'MUNICIPIO': 'HUELVA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 151848,
    'UTMy': 4130960
  },
  {
    'num': 65,
    'ESTACION': 'MARISMAS DEL TITAN',
    'MUNICIPIO': 'HUELVA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 150329,
    'UTMy': 4130181
  },
  {
    'num': 66,
    'ESTACION': 'POZO DULCE',
    'MUNICIPIO': 'HUELVA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 150958,
    'UTMy': 4130241
  },
  {
    'num': 67,
    'ESTACION': 'T.M.PUNTA DEL SEBO',
    'MUNICIPIO': 'HUELVA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 149593,
    'UTMy': 4127880
  },
  {
    'num': 68,
    'ESTACION': 'T.M.TARTESSOS',
    'MUNICIPIO': 'HUELVA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 157625,
    'UTMy': 4135871
  },
  {
    'num': 69,
    'ESTACION': 'EL ARENOSILLO',
    'MUNICIPIO': 'MOGUER',
    'PROVINCIA': 'HUELVA',
    'UTMx': 168146,
    'UTMy': 4112948
  },
  {
    'num': 70,
    'ESTACION': 'MOGUER',
    'MUNICIPIO': 'MOGUER',
    'PROVINCIA': 'HUELVA',
    'UTMx': 160074,
    'UTMy': 4133002
  },
  {
    'num': 71,
    'ESTACION': 'MAZAGON',
    'MUNICIPIO': 'MOGUER',
    'PROVINCIA': 'HUELVA',
    'UTMx': 161755,
    'UTMy': 4116505
  },
  {
    'num': 72,
    'ESTACION': 'NIEBLA',
    'MUNICIPIO': 'NIEBLA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 174188,
    'UTMy': 4140988
  },
  {
    'num': 73,
    'ESTACION': 'TORREARENILLA',
    'MUNICIPIO': 'PALOS DE LA FRONTERA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 153385,
    'UTMy': 4123132
  },
  {
    'num': 74,
    'ESTACION': 'LA RABIDA',
    'MUNICIPIO': 'PALOS DE LA FRONTERA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 152031,
    'UTMy': 4124237
  },
  {
    'num': 75,
    'ESTACION': 'PALOS',
    'MUNICIPIO': 'PALOS DE LA FRONTERA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 154934,
    'UTMy': 4126284
  },
  {
    'num': 76,
    'ESTACION': 'T.M.CEPSA RÁBIDA',
    'MUNICIPIO': 'PALOS DE LA FRONTERA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 152532,
    'UTMy': 4122512
  },
  {
    'num': 77,
    'ESTACION': 'PUNTA UMBRIA',
    'MUNICIPIO': 'PUNTA UMBRÍA',
    'PROVINCIA': 'HUELVA',
    'UTMx': 148070,
    'UTMy': 4122836
  },
  {
    'num': 78,
    'ESTACION': 'SAN JUAN DEL PUERTO',
    'MUNICIPIO': 'SAN JUAN DEL PUERTO',
    'PROVINCIA': 'HUELVA',
    'UTMx': 159270,
    'UTMy': 4136797
  },
  {
    'num': 79,
    'ESTACION': 'BAILEN',
    'MUNICIPIO': 'BAILÉN',
    'PROVINCIA': 'JAÉN',
    'UTMx': 431261,
    'UTMy': 4216416
  },
  {
    'num': 80,
    'ESTACION': 'RONDA DEL VALLE',
    'MUNICIPIO': 'JAÉN',
    'PROVINCIA': 'JAÉN',
    'UTMx': 431177,
    'UTMy': 4181976
  },
  {
    'num': 81,
    'ESTACION': 'LAS FUENTEZUELAS',
    'MUNICIPIO': 'JAÉN',
    'PROVINCIA': 'JAÉN',
    'UTMx': 428647,
    'UTMy': 4182208
  },
  {
    'num': 82,
    'ESTACION': 'VILLANUEVA DEL ARZOBISPO',
    'MUNICIPIO': 'VILLANUEVA DEL ARZOBISPO',
    'PROVINCIA': 'JAÉN',
    'UTMx': 499105,
    'UTMy': 4224614
  },
  {
    'num': 83,
    'ESTACION': 'CAMPILLOS',
    'MUNICIPIO': 'CAMPILLOS',
    'PROVINCIA': 'MÁLAGA',
    'UTMx': 335765,
    'UTMy': 4092280
  },
  {
    'num': 84,
    'ESTACION': 'AVENIDA JUAN XXIII',
    'MUNICIPIO': 'MÁLAGA',
    'PROVINCIA': 'MÁLAGA',
    'UTMx': 370966,
    'UTMy': 4063575
  },
  {
    'num': 85,
    'ESTACION': 'EL ATABAL',
    'MUNICIPIO': 'MÁLAGA',
    'PROVINCIA': 'MÁLAGA',
    'UTMx': 369138,
    'UTMy': 4065873
  },
  {
    'num': 86,
    'ESTACION': 'CARRANQUE',
    'MUNICIPIO': 'MÁLAGA',
    'PROVINCIA': 'MÁLAGA',
    'UTMx': 370732,
    'UTMy': 4064748
  },
  {
    'num': 87,
    'ESTACION': 'CAMPANILLAS',
    'MUNICIPIO': 'MÁLAGA',
    'PROVINCIA': 'MÁLAGA',
    'UTMx': 360614,
    'UTMy': 4065819
  },
  {
    'num': 88,
    'ESTACION': 'MARBELLA ARCO',
    'MUNICIPIO': 'MARBELLA',
    'PROVINCIA': 'MÁLAGA',
    'UTMx': 333023,
    'UTMy': 4042015
  },
  {
    'num': 89,
    'ESTACION': 'ALCALA DE GUADAIRA',
    'MUNICIPIO': 'ALCALÁ DE GUADAIRA',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 248974,
    'UTMy': 4136631
  },
  {
    'num': 90,
    'ESTACION': 'DOS HERMANAS',
    'MUNICIPIO': 'DOS HERMANAS',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 241677,
    'UTMy': 4130413
  },
  {
    'num': 91,
    'ESTACION': 'COBRE LAS CRUCES',
    'MUNICIPIO': 'GUILLENA',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 231798,
    'UTMy': 4160779
  },
  {
    'num': 92,
    'ESTACION': 'ALJARAFE',
    'MUNICIPIO': 'MAIRENA DEL ALJARAFE',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 230473,
    'UTMy': 4137017
  },
  {
    'num': 93,
    'ESTACION': 'SIERRA NORTE',
    'MUNICIPIO': 'SAN NICOLÁS DEL PUERTO',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 265817,
    'UTMy': 4208544
  },
  {
    'num': 94,
    'ESTACION': 'BERMEJALES',
    'MUNICIPIO': 'SEVILLA',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 236063,
    'UTMy': 4137554
  },
  {
    'num': 95,
    'ESTACION': 'CENTRO',
    'MUNICIPIO': 'SEVILLA',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 235156,
    'UTMy': 4142125
  },
  {
    'num': 96,
    'ESTACION': 'SANTA CLARA',
    'MUNICIPIO': 'SEVILLA',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 238720,
    'UTMy': 4143149
  },
  {
    'num': 97,
    'ESTACION': 'TORNEO',
    'MUNICIPIO': 'SEVILLA',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 234151,
    'UTMy': 4142873
  },
  {
    'num': 98,
    'ESTACION': 'PRINCIPES',
    'MUNICIPIO': 'SEVILLA',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 233863,
    'UTMy': 4140741
  },
  {
    'num': 99,
    'ESTACION': 'SAN JERONIMO',
    'MUNICIPIO': 'SEVILLA',
    'PROVINCIA': 'SEVILLA',
    'UTMx': 236286,
    'UTMy': 4146731
  }
];
