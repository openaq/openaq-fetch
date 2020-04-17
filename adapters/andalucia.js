'use strict';

import { acceptableParameters } from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import cheerio from 'cheerio';
import { chunk, flattenDeep, includes, find } from 'lodash';
import { default as moment } from 'moment-timezone';
import { parallel } from 'async';
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
    let tasks = [];
    // try/catch making task list. if the html used to make tasks is not reachable, end adapter.
    try {
      let $ = cheerio.load(body);
      $('select[name=PROVINCIA]').children().filter((i, el) => {
        tasks.push({
          provinceName: $(el).text(),
          provinceID: $(el)['0'].attribs.value
        });
      });
    } catch (e) {
      return callback({message: 'Unkown adapter error.'});
    }
    const now = moment();
    // generate list of tasks
    tasks = tasks.map((task) => {
      let url = source.sourceURL + `${now.format('MMM').toLowerCase() + now.format('YY')}/n${task.provinceID + now.format('YYMMDD')}.htm`;
      return generateTasks(url, task, now);
    });
    // execute in parallel
    parallel(
      tasks,
      (err, results) => {
        if (err) {
          return callback(null, err);
        }
        results = flattenDeep(results);
        return callback(null, {name: 'unused', measurements: results});
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
    parallel([
      (cb) => {
        request.get(
          url, (err, res, body) => {
            if (err || res.statusCode !== 200) {
              return cb(null, []);
            }
            try {
              let $ = cheerio.load(body);
              const data = formatData($, stations);
              return cb(null, data);
            } catch (e) {
              return cb(err);
            }
          }
        );
      },
      (cb) => {
        url = url.replace(now.format('YYMMDD'), moment().add(-1, 'days').format('YYMMDD'));
        request.get(
          url, (err, res, body) => {
            if (err || res.statusCode !== 200) {
              return cb(null, []);
            }
            try {
              let $ = cheerio.load(body);
              const data = formatData($, stations);
              return cb(null, data);
            } catch (e) {
              return cb(err);
            }
          }
        );
      }], (err, res) => {
      if (err ||
          res === undefined ||
          res[0] === undefined ||
          res[1] === undefined) {
        return done(null, []);
      }
      res = res[0].concat(res[1]);
      done(null, res);
    });
  };
};

const formatData = ($, stations) => {
  const tables = [];
  const stationNames = stations.map((station) => { return station.name; });
  // each station data sits in consecutive tables
  // the first table has the station name, the second the actual aq data.
  // the below logic checks to see if a table has a station name
  // and if it does, pushes it and the consecutive table to tables
  $('table').each((i, el) => {
    const stationMatch = find(stationNames, (stationName) => {
      const tableText = $(el).text();
      return tableText.match(stationName);
    });
    if (stationMatch) {
      const stationTop = $($('table')[i]);
      const stationBottom = $($('table')[i + 1]);
      tables.push(stationTop);
      tables.push(stationBottom);
    }
  });
  // data is held two consecutive tables
  // (one with station name, other actual data)
  let stationData = chunk(tables, 2);
  // return a list of measurement objects for each table.
  return stationData.map((table) => {
    const city = $(table[0]['0'].children[1]).text().split('Municipio')[1].trim();
    const station = $(table[0]['0'].children[2]).text().split('Estacion')[1].trim();
    const stationLoc = mapStationCoords(station);
    table = makeTable(table[1]['0'], $);
    return makeMeasurements(table, stationLoc, station, city);
  });
};

const mapStationCoords = (station) => {
  return stations.filter((stationObj) => {
    return stationObj['name'] === station;
  }).map((stationObj) => {
    return {
      latitude: stationObj['coordinates'][1],
      longitude: stationObj['coordinates'][0]
    };
  })[0];
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

const makeMeasurements = (stationData, stationLoc, stationName, cityName) => {
  // get index of data sources we can record
  const pollutantIndexes = stationData[0].filter((cell) => {
    return includes(acceptableParameters.slice(3, 5), cell.toLowerCase());
  }).map((validCell) => {
    return stationData[0].indexOf(validCell);
  });
  // include index for 1st column, which has the date
  pollutantIndexes.push(0);
  // filter rows for only the date,SO2, and NO2 rows
  stationData = stationData.map((row) => {
    return row.filter((cell, index) => {
      if (includes(pollutantIndexes, index)) {
        return cell;
      }
    });
  });
  // make each row into a list of measurements
  stationData = stationData.slice(1, -1).map((row, index) => {
    return row.map((cell, index) => {
      if (index !== 0) {
        // ignore blank spaces
        if (/\S/.test(cell)) {
          return {
            location: stationName.replace(/\w\S*/g, (t) => { return t.charAt(0).toUpperCase() + t.substr(1).toLowerCase(); }),
            city: cityName.replace(/\w\S*/g, (t) => { return t.charAt(0).toUpperCase() + t.substr(1).toLowerCase(); }),
            parameter: stationData[0][index].toLowerCase(),
            date: makeDate(row[0]),
            coordinates: stationLoc,
            value: parseInt(cell),
            unit: 'µg/m³',
            attribution: [{
              name: 'Ministry of Environment and Spatial Planning',
              url: 'http://www.juntadeandalucia.es/medioambiente/site/portalweb'
            }],
            averagingPeriod: {
              unit: 'hours',
              // averaging period gathered from source.url
              value: stationData[0][index] === 'SO2' ? 24 : 1
            }
          };
        }
      }
    }).filter((cell) => {
      if (cell !== 'undefined') {
        return cell;
      }
    });
  });
  // merge all measurement lists into one
  return [].concat.apply([], stationData);
};

const makeDate = (date) => {
  date = moment.tz(date, 'DD/MM/YY-hh:mm', 'Europe/Gibraltar');
  return {
    utc: date.toDate(),
    local: date.format()
  };
};

const stations = [
  {
    'name': 'ALCALA DE GUADAIRA',
    'coordinates': [
      -5.83372829297275,
      37.3424616097331
    ]
  },
  {
    'name': 'ALGAR',
    'coordinates': [
      -5.66140257575124,
      36.6496349442286
    ]
  },
  {
    'name': 'ALGECIRAS EPS',
    'coordinates': [
      -5.45342334882692,
      36.1362319718131
    ]
  },
  {
    'name': 'ALJARAFE',
    'coordinates': [
      -6.04245888664765,
      37.3407514842065
    ]
  },
  {
    'name': 'ARCOS',
    'coordinates': [
      -5.74372265610218,
      36.7397505566317
    ]
  },
  {
    'name': 'ASOMADILLA',
    'coordinates': [
      -4.77957179596027,
      37.9027418784996
    ]
  },
  {
    'name': 'AVDA. AL-NASIR',
    'coordinates': [
      -4.78012347442897,
      37.8925950570079
    ]
  },
  {
    'name': 'Avda. MARCONI',
    'coordinates': [
      -6.26857238885376,
      36.5060156494428
    ]
  },
  {
    'name': 'AVENIDA JUAN XXIII',
    'coordinates': [
      -4.44468102271592,
      36.7090982156429
    ]
  },
  {
    'name': 'BAILEN',
    'coordinates': [
      -3.78391252324497,
      38.0929300304407
    ]
  },
  {
    'name': 'BEDAR',
    'coordinates': [
      -1.98540237557918,
      37.1934252225575
    ]
  },
  {
    'name': 'BENAHADUX',
    'coordinates': [
      -2.46321804058202,
      36.9230982118208
    ]
  },
  {
    'name': 'BERMEJALES',
    'coordinates': [
      -5.97962812390116,
      37.3471907952484
    ]
  },
  {
    'name': 'CAMPAMENTO',
    'coordinates': [
      -5.37696950280927,
      36.1794341287161
    ]
  },
  {
    'name': 'CAMPANILLAS',
    'coordinates': [
      -4.56095497889189,
      36.7278572726192
    ]
  },
  {
    'name': 'CAMPILLOS',
    'coordinates': [
      -4.84483380018459,
      36.9622967816779
    ]
  },
  {
    'name': 'CAMPOHERMOSO',
    'coordinates': [
      -2.1281923855126,
      36.9338489226264
    ]
  },
  {
    'name': 'CAMPUS EL CARMEN',
    'coordinates': [
      -6.9246203280391,
      37.2714800687201
    ]
  },
  {
    'name': 'CARBONERAS',
    'coordinates': [
      -1.89201015457705,
      36.99944940914
    ]
  },
  {
    'name': 'CARRANQUE',
    'coordinates': [
      -4.44749849600678,
      36.7196374482505
    ]
  },
  {
    'name': 'CARTUJA',
    'coordinates': [
      -6.11449433455086,
      36.6608628569445
    ]
  },
  {
    'name': 'CENTRO',
    'coordinates': [
      -5.99148934024501,
      37.3880786742703
    ]
  },
  {
    'name': 'CIUDAD DEPORTIVA',
    'coordinates': [
      -3.61925275813457,
      37.1355591543718
    ]
  },
  {
    'name': 'COBRE LAS CRUCES',
    'coordinates': [
      -6.03616087321919,
      37.5550190832439
    ]
  },
  {
    'name': 'CORTIJILLOS',
    'coordinates': [
      -5.43575712940947,
      36.1904826974206
    ]
  },
  {
    'name': 'DOS HERMANAS',
    'coordinates': [
      -5.91384191767095,
      37.2844845561649
    ]
  },
  {
    'name': 'E. DE HOSTELERIA',
    'coordinates': [
      -5.38370311214421,
      36.2038793698316
    ]
  },
  {
    'name': 'E1: COLEGIO LOS BARRIOS',
    'coordinates': [
      -5.4889301640838,
      36.1856207988945
    ]
  },
  {
    'name': 'E2: ALCORNOCALES',
    'coordinates': [
      -5.66349609291426,
      36.2338647321404
    ]
  },
  {
    'name': 'E3: COLEGIO CARTEYA',
    'coordinates': [
      -5.39138163797878,
      36.2087915508404
    ]
  },
  {
    'name': 'E4: RINCONCILLO',
    'coordinates': [
      -5.44254780031943,
      36.1617454419319
    ]
  },
  {
    'name': 'E5: PALMONES',
    'coordinates': [
      -5.43276720391821,
      36.1747073666682
    ]
  },
  {
    'name': 'E6: ESTACION DE FFCC S. ROQUE',
    'coordinates': [
      -5.43026395248102,
      36.2120457543514
    ]
  },
  {
    'name': 'E7: EL ZABAL',
    'coordinates': [
      -5.34193933241622,
      36.1731485469259
    ]
  },
  {
    'name': 'ECONOMATO',
    'coordinates': [
      -5.38081007423352,
      36.1862078723027
    ]
  },
  {
    'name': 'EL ARENOSILLO',
    'coordinates': [
      -6.73407119375383,
      37.104086617877
    ]
  },
  {
    'name': 'EL ATABAL',
    'coordinates': [
      -4.46553495908059,
      36.7295574570493
    ]
  },
  {
    'name': 'EL BOTICARIO',
    'coordinates': [
      -2.39049953963171,
      36.8649557241293
    ]
  },
  {
    'name': 'EL EJIDO',
    'coordinates': [
      -2.81096707675371,
      36.7697216580892
    ]
  },
  {
    'name': 'FERNAN PEREZ',
    'coordinates': [
      -2.04672655909552,
      36.8951018950274
    ]
  },
  {
    'name': 'GRANADA-NORTE',
    'coordinates': [
      -3.61265949521279,
      37.1961046421122
    ]
  },
  {
    'name': 'GUADARRANQUE',
    'coordinates': [
      -5.41140475105146,
      36.1820980093152
    ]
  },
  {
    'name': 'JEDULA',
    'coordinates': [
      -5.92108975982459,
      36.7416987666838
    ]
  },
  {
    'name': 'JEREZ-CHAPIN',
    'coordinates': [
      -6.11724529470848,
      36.6885539329182
    ]
  },
  {
    'name': 'LA JOYA',
    'coordinates': [
      -1.96148344269345,
      36.9500045721069
    ]
  },
  {
    'name': 'LA LINEA',
    'coordinates': [
      -5.34835402177554,
      36.1593765791326
    ]
  },
  {
    'name': 'LA ORDEN',
    'coordinates': [
      -6.93807633408643,
      37.2796354461791
    ]
  },
  {
    'name': 'LA RABIDA',
    'coordinates': [
      -6.92026798998562,
      37.1997646111733
    ]
  },
  {
    'name': 'LAS FUENTEZUELAS',
    'coordinates': [
      -3.81032829398102,
      37.784441925924
    ]
  },
  {
    'name': 'LEPANTO',
    'coordinates': [
      -4.76233810602946,
      37.8926104151968
    ]
  },
  {
    'name': 'LOS BARRIOS',
    'coordinates': [
      -5.4808245009931,
      36.1753880490663
    ]
  },
  {
    'name': 'LOS ROSALES',
    'coordinates': [
      -6.92546310245881,
      37.2601556171702
    ]
  },
  {
    'name': 'MADREVIEJA',
    'coordinates': [
      -5.40470531906544,
      36.2044234180227
    ]
  },
  {
    'name': 'MARBELLA ARCO',
    'coordinates': [
      -4.86463053355266,
      36.5089258171877
    ]
  },
  {
    'name': 'MARISMAS DEL TITAN',
    'coordinates': [
      -6.94218747450492,
      37.2525815986743
    ]
  },
  {
    'name': 'MATALASCA\ufffdAS',
    'coordinates': [
      -6.57042044961113,
      37.0161019123845
    ]
  },
  {
    'name': 'MAZAGON',
    'coordinates': [
      -6.80744460735161,
      37.1337943069137
    ]
  },
  {
    'name': 'MEDITERRANEO',
    'coordinates': [
      -2.44671996011431,
      36.8413332017997
    ]
  },
  {
    'name': 'MOGUER',
    'coordinates': [
      -6.83383805614224,
      37.2815581829801
    ]
  },
  {
    'name': 'MOJACAR',
    'coordinates': [
      -1.84220963780445,
      37.1387963724069
    ]
  },
  {
    'name': 'MOTRIL',
    'coordinates': [
      -3.51730142150679,
      36.7431184253911
    ]
  },
  {
    'name': 'NIEBLA',
    'coordinates': [
      -6.67865166738376,
      37.3590481112293
    ]
  },
  {
    'name': 'OBEJO',
    'coordinates': [
      -4.80172573969212,
      38.1324576496765
    ]
  },
  {
    'name': 'PALACIO DE CONGRESOS',
    'coordinates': [
      -3.60010307027148,
      37.1656834988294
    ]
  },
  {
    'name': 'PALOMARES',
    'coordinates': [
      -1.78173062088384,
      37.2549700427613
    ]
  },
  {
    'name': 'PALOS',
    'coordinates': [
      -6.88857735350462,
      37.2192510920051
    ]
  },
  {
    'name': 'PARQUE JOYERO',
    'coordinates': [
      -4.81582531653285,
      37.8752242576767
    ]
  },
  {
    'name': 'POBLADO',
    'coordinates': [
      -4.92680188287867,
      38.1081415917842
    ]
  },
  {
    'name': 'POZO DULCE',
    'coordinates': [
      -6.93513952108221,
      37.2533569113105
    ]
  },
  {
    'name': 'PRADO REY',
    'coordinates': [
      -5.53162771941761,
      36.7944908582217
    ]
  },
  {
    'name': 'PRINCIPES',
    'coordinates': [
      -6.00557811805626,
      37.3752504882633
    ]
  },
  {
    'name': 'PUENTE MAYORGA',
    'coordinates': [
      -5.38250511898404,
      36.1801352274113
    ]
  },
  {
    'name': 'PUNTA UMBRIA',
    'coordinates': [
      -6.96413653775016,
      37.1856818840077
    ]
  },
  {
    'name': 'PZA. DEL CASTILLO',
    'coordinates': [
      -1.89535275953373,
      36.9967853912117
    ]
  },
  {
    'name': 'RANILLA',
    'coordinates': [
      -5.95961774892733,
      37.3842498795264
    ]
  },
  {
    'name': 'RIO SAN PEDRO',
    'coordinates': [
      -6.22516988622941,
      36.5228231904886
    ]
  },
  {
    'name': 'RODALQUILAR',
    'coordinates': [
      -2.03818849078265,
      36.8474557850741
    ]
  },
  {
    'name': 'ROMERALEJO',
    'coordinates': [
      -6.91904653221028,
      37.267250908198
    ]
  },
  {
    'name': 'RONDA DEL VALLE',
    'coordinates': [
      -3.78157654854438,
      37.782545140183
    ]
  },
  {
    'name': 'SAN FERNANDO',
    'coordinates': [
      -6.2030661919351,
      36.4605944072293
    ]
  },
  {
    'name': 'SAN JERONIMO',
    'coordinates': [
      -5.98038500280656,
      37.4298620732358
    ]
  },
  {
    'name': 'SAN JUAN DEL PUERTO',
    'coordinates': [
      -6.84462674008048,
      37.315395192284
    ]
  },
  {
    'name': 'SANTA CLARA',
    'coordinates': [
      -5.95164383477082,
      37.3983077540955
    ]
  },
  {
    'name': 'SIERRA NORTE',
    'coordinates': [
      -5.66687331825753,
      37.9943454185363
    ]
  },
  {
    'name': 'T. M. CEPSA (10 MTS)',
    'coordinates': [
      -5.40034364562947,
      36.193794290428
    ]
  },
  {
    'name': 'T. M. CEPSA (60 MTS)',
    'coordinates': [
      -5.40034364562947,
      36.193794290428
    ]
  },
  {
    'name': 'T.M. CEPSA LA RABIDA (35 MTS)',
    'coordinates': [
      -6.91383364682582,
      37.1844381350459
    ]
  },
  {
    'name': 'T.M. CTLA (10 MTS)',
    'coordinates': [
      -1.90496740467068,
      36.9783236955729
    ]
  },
  {
    'name': 'T.M. CTLA (30 MTS)',
    'coordinates': [
      -1.90496740467068,
      36.9783236955729
    ]
  },
  {
    'name': 'T.M. CTLA (60 MTS)',
    'coordinates': [
      -1.90496740467068,
      36.9783236955729
    ]
  },
  {
    'name': 'T.M. CTLA (SUP)',
    'coordinates': [
      -1.90496740467068,
      36.9783236955729
    ]
  },
  {
    'name': 'T.M. VILLARICOS',
    'coordinates': [
      -1.76528457027006,
      37.2587655899421
    ]
  },
  {
    'name': 'T.M.ARCOS',
    'coordinates': [
      -5.81416511148127,
      36.6692366172567
    ]
  },
  {
    'name': 'T.M.PUNTA DEL SEBO (35 MTS)',
    'coordinates': [
      -6.94938562236194,
      37.2316132586951
    ]
  },
  {
    'name': 'T.M.TARTESSOS (51 MTS)',
    'coordinates': [
      -6.86272292084739,
      37.3064631304473
    ]
  },
  {
    'name': 'TM-CTLB(15MTS)',
    'coordinates': [
      -5.41675649777288,
      36.1811427849335
    ]
  },
  {
    'name': 'TORNEO',
    'coordinates': [
      -6.00309570311933,
      37.3945241280366
    ]
  },
  {
    'name': 'TORREARENILLA',
    'coordinates': [
      -6.90453342985562,
      37.1903307092292
    ]
  },
  {
    'name': 'VILLAHARTA',
    'coordinates': [
      -4.90396696375797,
      38.1379275583166
    ]
  },
  {
    'name': 'VILLANUEVA DEL ARZOBISPO',
    'coordinates': [
      -3.00514909268167,
      38.1750276172737
    ]
  },
  {
    'name': 'VILLARICOS',
    'coordinates': [
      -1.77082602873914,
      37.2522344024592
    ]
  }
];
