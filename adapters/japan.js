import {unifyParameters, unifyMeasurementUnits, removeUnwantedParameters} from '../lib/utils';
import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { MultiStream, DataStream, StringStream } from 'scramjet';
import log from '../lib/logger';

const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'japan';

function fetchStream (source) {
  const out = new DataStream();
  out.name = 'unused';

  log.debug('Fetch stream called');

  loadAllFiles(source)
    .then((stations) => loadAllCSV(stations))
    .then(stream => stream.pipe(out))
  ;
  return out;
}

export async function fetchData (source, cb) {
  const sourceURL = source.url + '/' + moment().format('YYYYMM') + '/' + moment().format('YYYYMM') + '_00.zip';
  request({
    method: 'GET',
    url: sourceURL,
    encoding: null
  }, async function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }
    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      const stream = await fetchStream(body);
      const measurements = await stream.toArray();
      // Make sure the data is valid
      if (measurements === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, {name: stream.name, measurements});
    } catch (e) {
      console.log(e);
      return cb({message: 'Unknown adapter error.'});
    }
  });
}
const loadAllFiles = (source) => {
  const JSZip = require('jszip');
  return JSZip.loadAsync(source).then(function (zip) {
    return Object.keys(zip.files).map(z => {
      return JSZip.loadAsync(zip.file(z).async('arraybuffer')).then(async function (f) {
        const csv = [];
        for (let key in Object.keys(f.files)) {
          csv.push(await f.file(Object.keys(f.files)[key]).async('string'));
        }
        return csv;
      });
    });
    }).then(async function (files) {
      files = await Promise.all(files);
      files = [].concat.apply([], files);
      return files;
    });
};

const loadAllCSV = (files) => {
  const getParams = (header) => {
    const params = [null, null, null];
    for (let i = 3; i < header.length; i++) {
      const p = String(header[i]).split('(');
      p[1] = p[1].replace(')', '');
      params.push({
        parameter: p[0],
        unit: p[1]
      });
    }
    return params;
  };
  let param;
  return new MultiStream(
    files.map(file => {
      return StringStream.from(file)
        .CSVParse({header: false, delimiter: ',', skipEmptyLines: true})
        .shift(1, columns => (param = getParams(columns[0])))
        .filter(o => (moment().date() - moment(o[1], 'YYYY/MM/DD').date() <= 1))
        .filter(o => o[0] in stations)
        .flatMap(record => {
          const matchedStation = stations[record[0]];
          const dateMoment = moment.tz(record[1] + record[2], 'YYYY-MM-DD HH:mm', 'Asia/Tokyo');
          var timeMeasurements = [];
          const baseObject = {
            location: matchedStation.location,
            city: matchedStation.prefecture,
            coordinates: {
                latitude: Number(matchedStation.latitude),
                longitude: Number(matchedStation.longitude)
            },
            date: {
                utc: dateMoment.toDate(),
                local: dateMoment.format()
            },
            attribution: [{
                name: 'Soromame.taiki',
                url: 'http://soramame.taiki.go.jp/'
            }],
            averagingPeriod: {
                unit: 'hours',
                value: 1
            }
          };
          for (let i = 3; i < record.length; i++) {
            if (!(isNaN(record[i]) || Number(record[i]) === 0)) {
              var m = Object.assign({
                value: Number(record[i]),
                parameter: param[i].parameter,
                unit: param[i].unit
              }, baseObject);
              m = unifyMeasurementUnits(m);
              m = unifyParameters(m);
              timeMeasurements.push(m);
            }
          }
            timeMeasurements = removeUnwantedParameters(timeMeasurements);
            return timeMeasurements;
        });
    })
  ).mux();
};

const stations = {
'10201090': {
    'prefecture': 'Gunma',
    'location': 'eiseikankyoukenkyujyo',
    'latitude': 36.405,
    'longitude': 139.09583
},
'10201510': {
    'prefecture': 'Gunma',
    'location': 'Kokusetsumaebashijidousyakoutsukannkyousokutijyo',
    'latitude': 36.38194,
    'longitude': 139.04194
},
'10202010': {
    'prefecture': 'Gunma',
    'location': 'kinrouhoomu_chushajo',
    'latitude': 36.33806,
    'longitude': 139.0125
},
'10203010': {
    'prefecture': 'Gunma',
    'location': 'Kiryuhigashiritsu_higasisyougakkou',
    'latitude': 36.40944,
    'longitude': 139.34306
},
'10203510': {
    'prefecture': 'Gunma',
    'location': 'Kiryujihaikyoku',
    'latitude': 36.37167,
    'longitude': 139.35361
},
'10204030': {
    'prefecture': 'Gunma',
    'location': 'Isesakishiritu_minamisyougakkou',
    'latitude': 36.31111,
    'longitude': 139.19722
},
'10204510': {
    'prefecture': 'Gunma',
    'location': 'Isezakijihai',
    'latitude': 36.3025,
    'longitude': 139.20778
},
'10205010': {
    'prefecture': 'Gunma',
    'location': 'Ootashiritsu_chuousyougakkou',
    'latitude': 36.28667,
    'longitude': 139.38472
},
'10205510': {
    'prefecture': 'Gunma',
    'location': 'Ootajihaikyoku',
    'latitude': 36.28306,
    'longitude': 139.37722
},
'10206010': {
    'prefecture': 'Gunma',
    'location': 'Numatashiritsu_syougakkou',
    'latitude': 36.64583,
    'longitude': 139.04278
},
'10207010': {
    'prefecture': 'Gunma',
    'location': 'Tatebayashi_shiminsenta-',
    'latitude': 36.24972,
    'longitude': 139.54917
},
'10207510': {
    'prefecture': 'Gunma',
    'location': 'Tatebayashijihai',
    'latitude': 36.23528,
    'longitude': 139.52056
},
'10208010': {
    'prefecture': 'Gunma',
    'location': 'Shibukawadaiichisokuteikyoku',
    'latitude': 36.49583,
    'longitude': 138.99417
},
'10208510': {
    'prefecture': 'Gunma',
    'location': 'Shibukawajihai',
    'latitude': 36.49222,
    'longitude': 138.01167
},
'10210010': {
    'prefecture': 'Gunma',
    'location': 'Tomiokashiritsu_tomiokasyougakkou',
    'latitude': 36.25917,
    'longitude': 138.89833
},
'10211010': {
    'prefecture': 'Gunma',
    'location': 'Annakadaiichisokutei',
    'latitude': 36.32028,
    'longitude': 138.91694
},
'10211030': {
    'prefecture': 'Gunma',
    'location': 'Nodono533',
    'latitude': 36.32083,
    'longitude': 138.92278
},
'10211040': {
    'prefecture': 'Gunma',
    'location': 'Iwanoya_kouminkan',
    'latitude': 36.32667,
    'longitude': 138.93083
},
'10211060': {
    'prefecture': 'Gunma',
    'location': 'Annakashiritsu_annakasyougakkou',
    'latitude': 36.33056,
    'longitude': 138.89639
},
'10211510': {
    'prefecture': 'Gunma',
    'location': 'Annakajihai',
    'latitude': 36.33222,
    'longitude': 138.91694
},
'10423010': {
    'prefecture': 'Gunma',
    'location': 'Higashiagatsumatyouritsuhigashiagatsumatyuugakkou',
    'latitude': 36.5775,
    'longitude': 138.82861
},
'10425010': {
    'prefecture': 'Gunma',
    'location': 'Tsumagoimuraundoukouen',
    'latitude': 36.50722,
    'longitude': 138.51528
},
'10449010': {
    'prefecture': 'Gunma',
    'location': 'Minakamisokuteikyoku',
    'latitude': 36.73111,
    'longitude': 138.98278
},
'10464010': {
    'prefecture': 'Gunma',
    'location': 'Suishitsujoukasenta-',
    'latitude': 36.29889,
    'longitude': 139.11
},
'11110010': {
    'prefecture': 'Saitama',
    'location': 'saitamashijonan',
    'latitude': 35.91361,
    'longitude': 139.72694
},
'11110510': {
    'prefecture': 'Saitama',
    'location': 'Saitamashinishiharajihai',
    'latitude': 35.95556,
    'longitude': 139.68028
},
'11201030': {
    'prefecture': 'Saitama',
    'location': 'Kawagoe-shi_Takashina',
    'latitude': 35.88694,
    'longitude': 139.48944
},
'11201040': {
    'prefecture': 'Saitama',
    'location': 'Kawagoe-shi_Kawagoe',
    'latitude': 35.92444,
    'longitude': 139.49028
},
'11201050': {
    'prefecture': 'Saitama',
    'location': 'Kawagoe-shi_Kasumigaseki',
    'latitude': 35.91611,
    'longitude': 139.43
},
'11201510': {
    'prefecture': 'Saitama',
    'location': 'Kawagoe-shi_Senba',
    'latitude': 35.90333,
    'longitude': 139.49611
},
'11202040': {
    'prefecture': 'Saitama',
    'location': 'Kumagaya',
    'latitude': 36.14472,
    'longitude': 139.39139
},
'11202510': {
    'prefecture': 'Saitama',
    'location': 'Kumagaya_Koiduka_jihai',
    'latitude': 36.16028,
    'longitude': 139.39833
},
'11203030': {
    'prefecture': 'Saitama',
    'location': 'KAWAGUCHISHIYOKOZONE',
    'latitude': 35.80056,
    'longitude': 139.70306
},
'11203040': {
    'prefecture': 'Saitama',
    'location': 'Kwaguchi-shi_nanpei',
    'latitude': 35.79667,
    'longitude': 139.75111
},
'11203050': {
    'prefecture': 'Saitama',
    'location': 'KAWAGUCHISHISHINGOU',
    'latitude': 35.82944,
    'longitude': 139.76472
},
'11203060': {
    'prefecture': 'Saitama',
    'location': 'KAWAGUCHISHISHIBA',
    'latitude': 35.83306,
    'longitude': 139.68639
},
'11203510': {
    'prefecture': 'Saitama',
    'location': 'KAWAGUCHISHIANGYOU',
    'latitude': 35.84139,
    'longitude': 139.75167
},
'11203530': {
    'prefecture': 'Saitama',
    'location': 'KAWAGUCHISHIKAMINE',
    'latitude': 35.85333,
    'longitude': 139.73139
},
'11204010': {
    'prefecture': 'Saitama',
    'location': 'Saitamashiyakusyo',
    'latitude': 35.85917,
    'longitude': 139.64917
},
'11204040': {
    'prefecture': 'Saitama',
    'location': 'saitamashinegishi',
    'latitude': 35.83944,
    'longitude': 139.66528
},
'11204520': {
    'prefecture': 'Saitama',
    'location': 'saitamashimagamotojihai',
    'latitude': 35.83694,
    'longitude': 139.63
},
'11204530': {
    'prefecture': 'Saitama',
    'location': 'saitamashitsujijihai',
    'latitude': 35.83083,
    'longitude': 139.65861
},
'11205020': {
    'prefecture': 'Saitama',
    'location': 'Miyahara',
    'latitude': 35.95167,
    'longitude': 139.60694
},
'11205030': {
    'prefecture': 'Saitama',
    'location': 'saitamashiharusato',
    'latitude': 35.94,
    'longitude': 139.66417
},
'11205040': {
    'prefecture': 'Saitama',
    'location': 'saitamashisashiogi',
    'latitude': 35.9225,
    'longitude': 139.5725
},
'11205050': {
    'prefecture': 'Saitama',
    'location': 'Katayanagi',
    'latitude': 35.90583,
    'longitude': 139.67389
},
'11205120': {
    'prefecture': 'Saitama',
    'location': 'Saitamashi-oomiya',
    'latitude': 35.90278,
    'longitude': 139.63417
},
'11205530': {
    'prefecture': 'Saitama',
    'latitude': 35.91389,
    'longitude': 139.59389
},
'11205540': {
    'prefecture': 'Saitama',
    'location': 'saitamashiowadajihai',
    'latitude': 35.93722,
    'longitude': 139.64556
},
'11206020': {
    'prefecture': 'Saitama',
    'location': 'Gyouda',
    'latitude': 36.1375,
    'longitude': 139.4725
},
'11207010': {
    'prefecture': 'Saitama',
    'location': 'Chichibu',
    'latitude': 35.985,
    'longitude': 139.08361
},
'11208060': {
    'prefecture': 'Saitama',
    'location': 'Tokorozawa-shi_higashitokorozawa',
    'latitude': 35.80056,
    'longitude': 139.5225
},
'11208070': {
    'prefecture': 'Saitama',
    'location': 'Tokorozawa-shi_kitano',
    'latitude': 35.78222,
    'longitude': 139.44306
},
'11208090': {
    'prefecture': 'Saitama',
    'location': 'tokorozawasinakatomi',
    'latitude': 35.81472,
    'longitude': 139.48333
},
'11208520': {
    'prefecture': 'Saitama',
    'location': 'Tokorozawa-shi_koukuu_kouen',
    'latitude': 35.79194,
    'longitude': 139.47472
},
'11208530': {
    'prefecture': 'Saitama',
    'location': 'Tokorozawa-shi_wagaahra',
    'latitude': 35.80222,
    'longitude': 139.4125
},
'11209010': {
    'prefecture': 'Saitama',
    'location': 'Hannou',
    'latitude': 35.85222,
    'longitude': 139.33167
},
'11210010': {
    'prefecture': 'Saitama',
    'location': 'Kazo',
    'latitude': 36.13167,
    'longitude': 139.60861
},
'11211010': {
    'prefecture': 'Saitama',
    'location': 'honjyou',
    'latitude': 36.23444,
    'longitude': 139.20444
},
'11212020': {
    'prefecture': 'Saitama',
    'location': 'Higashimatsuyama',
    'latitude': 36.02861,
    'longitude': 139.41917
},
'11212520': {
    'prefecture': 'Saitama',
    'location': 'Higashimatsuyama_Iwahana_jihai',
    'latitude': 36.04889,
    'longitude': 139.41444
},
'11213010': {
    'prefecture': 'Saitama',
    'location': 'Saitamashiiwatsuki',
    'latitude': 35.95,
    'longitude': 139.70111
},
'11214030': {
    'prefecture': 'Saitama',
    'location': 'Kasukabe',
    'latitude': 35.96861,
    'longitude': 139.74889
},
'11214510': {
    'prefecture': 'Saitama',
    'location': 'Kasukabe_Mashito_jihai',
    'latitude': 35.95278,
    'longitude': 139.73056
},
'11215010': {
    'prefecture': 'Saitama',
    'location': 'Sayama',
    'latitude': 35.85639,
    'longitude': 139.45167
},
'11216010': {
    'prefecture': 'Saitama',
    'location': 'Hanyuu',
    'latitude': 36.17139,
    'longitude': 139.55917
},
'11217010': {
    'prefecture': 'Saitama',
    'location': 'Kounosu',
    'latitude': 36.0625,
    'longitude': 139.52444
},
'11217510': {
    'prefecture': 'Saitama',
    'location': 'Kounosu_tenjin_jihai',
    'latitude': 36.05833,
    'longitude': 139.5225
},
'11218010': {
    'prefecture': 'Saitama',
    'location': 'Fukaya',
    'latitude': 36.18389,
    'longitude': 139.28278
},
'11218510': {
    'prefecture': 'Saitama',
    'location': 'Fukaya_Haragou_jihai',
    'latitude': 36.1925,
    'longitude': 139.29667
},
'11219020': {
    'prefecture': 'Saitama',
    'location': 'Ageo',
    'latitude': 35.97389,
    'longitude': 139.57444
},
'11221050': {
    'prefecture': 'Saitama',
    'location': 'Souka',
    'latitude': 35.82611,
    'longitude': 139.79889
},
'11221510': {
    'prefecture': 'Saitama',
    'location': 'Soukashihanagurijihai',
    'latitude': 35.83556,
    'longitude': 139.79306
},
'11221520': {
    'prefecture': 'Saitama',
    'location': 'Souka_harachou_jihai',
    'latitude': 35.84472,
    'longitude': 139.77722
},
'11222020': {
    'prefecture': 'Saitama',
    'location': 'Koshigaya-shi_Higashikoshigaya',
    'latitude': 35.89306,
    'longitude': 139.79861
},
'11222030': {
    'prefecture': 'Saitama',
    'location': 'koshigayashisengendainishi',
    'latitude': 35.935,
    'longitude': 139.76556
},
'11224010': {
    'prefecture': 'Saitama',
    'location': 'Toda',
    'latitude': 35.81556,
    'longitude': 139.67639
},
'11224510': {
    'prefecture': 'Saitama',
    'location': 'Toda_Bijogi_jihai',
    'latitude': 35.81778,
    'longitude': 139.64611
},
'11225010': {
    'prefecture': 'Saitama',
    'location': 'Iruma',
    'latitude': 35.82778,
    'longitude': 139.39917
},
'11225510': {
    'prefecture': 'Saitama',
    'location': 'Kokusetuirumajidousyakankyousokuteijyo',
    'latitude': 35.82778,
    'longitude': 139.38306
},
'11229010': {
    'prefecture': 'Saitama',
    'location': 'Wakou',
    'latitude': 35.77472,
    'longitude': 139.62139
},
'11229510': {
    'prefecture': 'Saitama',
    'location': 'Wakou_Niikura_jihai',
    'latitude': 35.77639,
    'longitude': 139.61778
},
'11230070': {
    'prefecture': 'Saitama',
    'location': 'Niiza',
    'latitude': 35.77611,
    'longitude': 139.55889
},
'11232010': {
    'prefecture': 'Saitama',
    'location': 'Kuki',
    'latitude': 36.06167,
    'longitude': 139.66472
},
'11232510': {
    'prefecture': 'Saitama',
    'location': 'Kuki_Honchou_jihai',
    'latitude': 36.07222,
    'longitude': 139.66889
},
'11234010': {
    'prefecture': 'Saitama',
    'location': 'Yashio',
    'latitude': 35.81944,
    'longitude': 139.8425
},
'11235010': {
    'prefecture': 'Saitama',
    'location': 'Fujimi',
    'latitude': 35.85361,
    'longitude': 139.55222
},
'11235510': {
    'prefecture': 'Saitama',
    'location': 'Fujimishimonanbatajihai',
    'latitude': 35.84694,
    'longitude': 139.57583
},
'11237020': {
    'prefecture': 'Saitama',
    'location': 'Misato',
    'latitude': 35.84111,
    'longitude': 139.885
},
'11238010': {
    'prefecture': 'Saitama',
    'location': 'Hasuda',
    'latitude': 35.97278,
    'longitude': 139.64944
},
'11239010': {
    'prefecture': 'Saitama',
    'location': 'Sakado',
    'latitude': 35.96778,
    'longitude': 139.40472
},
'11240010': {
    'prefecture': 'Saitama',
    'location': 'Satte',
    'latitude': 36.07167,
    'longitude': 139.735
},
'11241510': {
    'prefecture': 'Saitama',
    'location': 'Tsurugashima_jihai',
    'latitude': 35.92778,
    'longitude': 139.40306
},
'11326010': {
    'prefecture': 'Saitama',
    'location': 'Moroyama',
    'latitude': 35.96194,
    'longitude': 139.32556
},
'11329010': {
    'prefecture': 'Saitama',
    'location': 'Hidaka',
    'latitude': 35.89,
    'longitude': 139.34667
},
'11343010': {
    'prefecture': 'Saitama',
    'location': 'Ogawa',
    'latitude': 36.05778,
    'longitude': 139.26361
},
'11344010': {
    'prefecture': 'Saitama',
    'location': 'Higashichichibu',
    'latitude': 36.00222,
    'longitude': 139.19389
},
'11346510': {
    'prefecture': 'Saitama',
    'location': 'kawajimajihai',
    'latitude': 35.97944,
    'longitude': 139.46139
},
'11362010': {
    'prefecture': 'Saitama',
    'location': 'minano',
    'latitude': 36.07139,
    'longitude': 139.09917
},
'11382010': {
    'prefecture': 'Saitama',
    'location': 'Honjyou_kodama',
    'latitude': 36.18722,
    'longitude': 139.13722
},
'11403010': {
    'prefecture': 'Saitama',
    'location': 'Menuma',
    'latitude': 36.22,
    'longitude': 139.38472
},
'11408510': {
    'prefecture': 'Saitama',
    'location': 'Yorii_Sakurazawa_jihai',
    'latitude': 36.11917,
    'longitude': 139.21083
},
'11421010': {
    'prefecture': 'Saitama',
    'location': 'Kankyoukagakukokusaisenta',
    'latitude': 36.08111,
    'longitude': 139.56361
},
'11442010': {
    'prefecture': 'Saitama',
    'location': 'miyashiro',
    'latitude': 36.02722,
    'longitude': 139.71611
},
'12105010': {
    'prefecture': 'Chiba',
    'location': 'izumiyashogakkou',
    'latitude': 35.55444,
    'longitude': 140.17306
},
'12201010': {
    'prefecture': 'Chiba',
    'location': 'Hanamigawa_dai1_shougakkou',
    'latitude': 35.69389,
    'longitude': 140.09833
},
'12201020': {
    'prefecture': 'Chiba',
    'location': 'Kemigawa_shougakkou',
    'latitude': 35.64944,
    'longitude': 140.0675
},
'12201040': {
    'prefecture': 'Chiba',
    'location': 'Sannou_shougakkou',
    'latitude': 35.66472,
    'longitude': 140.14306
},
'12201050': {
    'prefecture': 'Chiba',
    'location': 'Miyanogi',
    'latitude': 35.65389,
    'longitude': 140.09778
},
'12201070': {
    'prefecture': 'Chiba',
    'location': 'Oomiya_shougakkou',
    'latitude': 35.59722,
    'longitude': 140.18167
},
'12201090': {
    'prefecture': 'Chiba',
    'location': 'Chishirodai_kita_shougakkou',
    'latitude': 35.62861,
    'longitude': 140.18361
},
'12201100': {
    'prefecture': 'Chiba',
    'location': 'Chiba-ken_rougakkou',
    'latitude': 35.56361,
    'longitude': 140.18083
},
'12201120': {
    'prefecture': 'Chiba',
    'location': 'Samugawa_shougakkou',
    'latitude': 35.59639,
    'longitude': 140.12139
},
'12201160': {
    'prefecture': 'Chiba',
    'location': 'Fukushouji',
    'latitude': 35.56722,
    'longitude': 140.12889
},
'12201180': {
    'prefecture': 'Chiba',
    'location': 'Soga_hoikusho',
    'latitude': 35.57222,
    'longitude': 140.13083
},
'12201200': {
    'prefecture': 'Chiba',
    'location': 'Chiba_shiyakusho_jihai',
    'latitude': 35.6075,
    'longitude': 140.10778
},
'12201250': {
    'prefecture': 'Chiba',
    'location': 'Miyako_kouen',
    'latitude': 35.61028,
    'longitude': 140.13778
},
'12201260': {
    'prefecture': 'Chiba',
    'location': 'Toke',
    'latitude': 35.53194,
    'longitude': 140.26083
},
'12201300': {
    'prefecture': 'Chiba',
    'location': 'Chigusa_jihai',
    'latitude': 35.63833,
    'longitude': 140.11778
},
'12201320': {
    'prefecture': 'Chiba',
    'location': 'Masago_kouen',
    'latitude': 35.63389,
    'longitude': 140.06944
},
'12201520': {
    'prefecture': 'Chiba',
    'location': 'Yoshikawa_jihai',
    'latitude': 35.60944,
    'longitude': 140.12
},
'12201540': {
    'prefecture': 'Chiba',
    'location': 'Miyanogi_jihai',
    'latitude': 35.65806,
    'longitude': 140.09806
},
'12201570': {
    'prefecture': 'Chiba',
    'location': 'Masago_jihai',
    'latitude': 35.62833,
    'longitude': 140.06639
},
'12202090': {
    'prefecture': 'Chiba',
    'location': 'choshisakae',
    'latitude': 35.72861,
    'longitude': 140.82556
},
'12203040': {
    'prefecture': 'Chiba',
    'location': 'Ichikawa_Futamata',
    'latitude': 35.69333,
    'longitude': 139.96028
},
'12203080': {
    'prefecture': 'Chiba',
    'location': 'Ichikawa_Oono',
    'latitude': 35.74694,
    'longitude': 139.95722
},
'12203110': {
    'prefecture': 'Chiba',
    'location': 'ICHIKAWAMOTOYAWATAKYOKU',
    'latitude': 35.72583,
    'longitude': 139.9275
},
'12203120': {
    'prefecture': 'Chiba',
    'location': 'ICHIKAWA GYOUTOKU EKIMAE',
    'latitude': 35.67944,
    'longitude': 139.91389
},
'12203510': {
    'prefecture': 'Chiba',
    'location': 'Ichikawa-shi_Ichikawa(kuruma)',
    'latitude': 35.72833,
    'longitude': 139.90917
},
'12203520': {
    'prefecture': 'Chiba',
    'location': 'Ichikawa_Gyoutoku(kuruma)',
    'latitude': 35.68306,
    'longitude': 139.91972
},
'12203550': {
    'prefecture': 'Chiba',
    'location': 'ichikawatoukagi(kuruma)',
    'latitude': 35.70944,
    'longitude': 139.92278
},
'12204040': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Maruyama',
    'latitude': 35.74222,
    'longitude': 139.99583
},
'12204050': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Takane',
    'latitude': 35.72611,
    'longitude': 140.00917
},
'12204060': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Takanedai',
    'latitude': 35.72889,
    'longitude': 140.04222
},
'12204070': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Maebara',
    'latitude': 35.69528,
    'longitude': 140.02389
},
'12204100': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Toyotomi',
    'latitude': 35.75778,
    'longitude': 140.07778
},
'12204110': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Innai',
    'latitude': 35.71389,
    'longitude': 139.95917
},
'12204140': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Wakamatsu',
    'latitude': 35.67611,
    'longitude': 139.99389
},
'12204150': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Minamihonchou',
    'latitude': 35.69694,
    'longitude': 139.97722
},
'12204520': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Kaijin(kuruma)',
    'latitude': 35.69972,
    'longitude': 139.97667
},
'12204530': {
    'prefecture': 'Chiba',
    'location': 'Funabashi_Hinode(kuruma)',
    'latitude': 35.68833,
    'longitude': 139.99611
},
'12205030': {
    'prefecture': 'Chiba',
    'location': 'Tateyama_Kamegahara',
    'latitude': 35.01833,
    'longitude': 139.88361
},
'12206010': {
    'prefecture': 'Chiba',
    'location': 'ＫＩＳＡＲＡＺＵＴＹＵＵＯＵ',
    'latitude': 35.38472,
    'longitude': 139.925
},
'12206030': {
    'prefecture': 'Chiba',
    'location': 'Kisaradu_Kuroto',
    'latitude': 35.41778,
    'longitude': 139.90306
},
'12206070': {
    'prefecture': 'Chiba',
    'location': 'Kisaradu_Kiyomidai',
    'latitude': 35.37722,
    'longitude': 139.95417
},
'12206080': {
    'prefecture': 'Chiba',
    'location': 'Kisaradu_Hatazawa',
    'latitude': 35.33861,
    'longitude': 139.90639
},
'12206140': {
    'prefecture': 'Chiba',
    'location': 'Kisaradu_Mariyatsu',
    'latitude': 35.365,
    'longitude': 140.07083
},
'12206520': {
    'prefecture': 'Chiba',
    'location': 'Kisaradu_Jouzai(kuruma)',
    'latitude': 35.37056,
    'longitude': 139.94139
},
'12206530': {
    'prefecture': 'Chiba',
    'location': 'Kisaradu_Ushibukuro(kuruma)',
    'latitude': 35.40389,
    'longitude': 139.96667
},
'12207010': {
    'prefecture': 'Chiba',
    'location': 'Matsudo_Nemoto',
    'latitude': 35.78417,
    'longitude': 139.90611
},
'12207020': {
    'prefecture': 'Chiba',
    'location': 'matsudogokou',
    'latitude': 35.79139,
    'longitude': 139.9625
},
'12207030': {
    'prefecture': 'Chiba',
    'location': 'matudohutatsugi',
    'latitude': 35.82306,
    'longitude': 139.92889
},
'12207520': {
    'prefecture': 'Chiba',
    'location': 'MATSUDOKAMIHONGO_KURUMA',
    'latitude': 35.8,
    'longitude': 139.9125
},
'12208010': {
    'prefecture': 'Chiba',
    'location': 'Noda-shi_Noda',
    'latitude': 35.94444,
    'longitude': 139.86917
},
'12208510': {
    'prefecture': 'Chiba',
    'location': 'Kokusetunodajidousyakoutsuukankyousokuteijyo',
    'latitude': 35.95083,
    'longitude': 139.87972
},
'12209010': {
    'prefecture': 'Chiba',
    'location': 'KATOROOKURA',
    'latitude': 35.88389,
    'longitude': 140.55611
},
'12210010': {
    'prefecture': 'Chiba',
    'location': 'Mobara_Takashi',
    'latitude': 35.43111,
    'longitude': 140.28917
},
'12211040': {
    'prefecture': 'Chiba',
    'location': 'Narita_Karabe',
    'latitude': 35.77083,
    'longitude': 140.29972
},
'12211510': {
    'prefecture': 'Chiba',
    'location': 'Narita_Hanasaki(kuruma)',
    'latitude': 35.775,
    'longitude': 140.32472
},
'12212040': {
    'prefecture': 'Chiba',
    'location': 'Sakura_Ebarashinden',
    'latitude': 35.72444,
    'longitude': 140.20972
},
'12212520': {
    'prefecture': 'Chiba',
    'location': 'Sakura_Sannou(kuruma)',
    'latitude': 35.68083,
    'longitude': 140.22028
},
'12213010': {
    'prefecture': 'Chiba',
    'location': 'Togane_Horiage',
    'latitude': 35.55167,
    'longitude': 140.37528
},
'12214010': {
    'prefecture': 'Chiba',
    'location': 'SOUSATUBAKI',
    'latitude': 35.71722,
    'longitude': 140.58139
},
'12216010': {
    'prefecture': 'Chiba',
    'location': 'Narashino_Saginuma',
    'latitude': 35.68222,
    'longitude': 140.03556
},
'12217020': {
    'prefecture': 'Chiba',
    'location': 'Kashiwa_eirakudai',
    'latitude': 35.84056,
    'longitude': 139.97556
},
'12217030': {
    'prefecture': 'Chiba',
    'location': 'Kashiwa_Oomuro',
    'latitude': 35.89694,
    'longitude': 139.96694
},
'12217510': {
    'prefecture': 'Chiba',
    'location': 'Kashiwa_Asahi(kuruma)',
    'latitude': 35.8575,
    'longitude': 139.96889
},
'12217520': {
    'prefecture': 'Chiba',
    'location': 'Kashiwa_Nishihara(kuruma)',
    'latitude': 35.89222,
    'longitude': 139.9175
},
'12218010': {
    'prefecture': 'Chiba',
    'location': 'Katsuura_Kobato',
    'latitude': 35.17583,
    'longitude': 140.26889
},
'12219010': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Yawata',
    'latitude': 35.53361,
    'longitude': 140.12722
},
'12219030': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Goi',
    'latitude': 35.50889,
    'longitude': 140.08972
},
'12219060': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Anesaki',
    'latitude': 35.47528,
    'longitude': 140.05278
},
'12219090': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Tsuiheiji',
    'latitude': 35.48444,
    'longitude': 140.08028
},
'12219110': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Uruido',
    'latitude': 35.49389,
    'longitude': 140.18361
},
'12219120': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Tatsumidai',
    'latitude': 35.52,
    'longitude': 140.15417
},
'12219140': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Yuushuu',
    'latitude': 35.44528,
    'longitude': 140.05528
},
'12219180': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Matsuzaki',
    'latitude': 35.44528,
    'longitude': 140.13917
},
'12219190': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Iwasakinishi',
    'latitude': 35.52333,
    'longitude': 140.07139
},
'12219200': {
    'prefecture': 'Chiba',
    'location': 'Ichiharakoorimoto',
    'latitude': 35.50667,
    'longitude': 140.11861
},
'12219380': {
    'prefecture': 'Chiba',
    'location': 'ichiharahirano',
    'latitude': 35.33,
    'longitude': 140.15
},
'12219390': {
    'prefecture': 'Chiba',
    'location': 'Ichihara_Houme',
    'latitude': 35.4025,
    'longitude': 140.14639
},
'12219520': {
    'prefecture': 'Chiba',
    'location': 'Ichiharanakakawada(kuruma)',
    'latitude': 35.50889,
    'longitude': 140.08167
},
'12220010': {
    'prefecture': 'Chiba',
    'location': 'Nagareyama_Heiwadai',
    'latitude': 35.85361,
    'longitude': 139.90667
},
'12221020': {
    'prefecture': 'Chiba',
    'location': 'Yachiyo_Takatsu',
    'latitude': 35.71361,
    'longitude': 140.085
},
'12221510': {
    'prefecture': 'Chiba',
    'location': 'Yachiyo_Murakami(kuruma)',
    'latitude': 35.71306,
    'longitude': 140.11667
},
'12222010': {
    'prefecture': 'Chiba',
    'location': 'Abiko_kohokudai',
    'latitude': 35.85889,
    'longitude': 140.07972
},
'12224040': {
    'prefecture': 'Chiba',
    'location': 'Kamagaya_Karuizawa',
    'latitude': 35.79056,
    'longitude': 140.02111
},
'12224510': {
    'prefecture': 'Chiba',
    'location': 'Kamagaya_Hatsutomi',
    'latitude': 35.78056,
    'longitude': 140.01111
},
'12225010': {
    'prefecture': 'Chiba',
    'location': 'Kimitsu_Kubo',
    'latitude': 35.33167,
    'longitude': 139.90194
},
'12225030': {
    'prefecture': 'Chiba',
    'location': 'Kimitsu_Sakada',
    'latitude': 35.34028,
    'longitude': 139.88778
},
'12225070': {
    'prefecture': 'Chiba',
    'location': 'Kimitsu_Miyanoshita',
    'latitude': 35.29833,
    'longitude': 139.93111
},
'12225080': {
    'prefecture': 'Chiba',
    'location': 'Kimitsu_Hitomi',
    'latitude': 35.33972,
    'longitude': 139.86917
},
'12225090': {
    'prefecture': 'Chiba',
    'location': 'Kimitsu_Tawarada',
    'latitude': 35.31944,
    'longitude': 140.05667
},
'12225120': {
    'prefecture': 'Chiba',
    'location': 'Kimitsu_Nukata',
    'latitude': 35.30111,
    'longitude': 139.9725
},
'12226010': {
    'prefecture': 'Chiba',
    'location': 'Futtsu_Shimoiino',
    'latitude': 35.31889,
    'longitude': 139.85667
},
'12227510': {
    'prefecture': 'Chiba',
    'location': 'Urayasu_Mihama(kuruma)',
    'latitude': 35.65222,
    'longitude': 139.91417
},
'12228010': {
    'prefecture': 'Chiba',
    'location': 'Yotsukaidou_Shikawatashi',
    'latitude': 35.66611,
    'longitude': 140.175
},
'12230010': {
    'prefecture': 'Chiba',
    'location': 'Yachimata-shi_Yachimata',
    'latitude': 35.66972,
    'longitude': 140.31528
},
'12301020': {
    'prefecture': 'Chiba',
    'location': 'Urayasu_Nekozane',
    'latitude': 35.65556,
    'longitude': 139.90917
},
'12303010': {
    'prefecture': 'Chiba',
    'location': 'NODAKIRIGASAKU',
    'latitude': 36.04444,
    'longitude': 139.81722
},
'12305510': {
    'prefecture': 'Chiba',
    'location': 'Kashiwaootsugaoka(Kuruma)',
    'latitude': 35.83861,
    'longitude': 140.00472
},
'12326010': {
    'prefecture': 'Chiba',
    'location': 'Shiroi_Nanatsugidai',
    'latitude': 35.79583,
    'longitude': 140.0475
},
'12327010': {
    'prefecture': 'Chiba',
    'location': 'Inzai_Takabana',
    'latitude': 35.79111,
    'longitude': 140.13556
},
'12329010': {
    'prefecture': 'Chiba',
    'location': 'Sakaeajikidai',
    'latitude': 35.84361,
    'longitude': 140.24944
},
'12343010': {
    'prefecture': 'Chiba',
    'location': 'NARITANADO',
    'latitude': 35.8525,
    'longitude': 140.42056
},
'12344020': {
    'prefecture': 'Chiba',
    'location': 'KATORIHANEGAWA',
    'latitude': 35.84444,
    'longitude': 140.60611
},
'12345020': {
    'prefecture': 'Chiba',
    'location': 'KATORIHUMA',
    'latitude': 35.78639,
    'longitude': 140.60889
},
'12408010': {
    'prefecture': 'Chiba',
    'location': 'YOKOSHIBAHIKARIYOKOSHIBA',
    'latitude': 35.65167,
    'longitude': 140.48778
},
'12409010': {
    'prefecture': 'Chiba',
    'location': 'shibayamayamada',
    'latitude': 35.71444,
    'longitude': 140.40667
},
'12421020': {
    'prefecture': 'Chiba',
    'location': 'Ichinomiya_Torami',
    'latitude': 35.34472,
    'longitude': 140.38333
},
'12463010': {
    'prefecture': 'Chiba',
    'location': 'Kyonan_Shimosakuma',
    'latitude': 35.10722,
    'longitude': 139.83861
},
'12481010': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Sakatoichiba',
    'latitude': 35.42556,
    'longitude': 139.95722
},
'12481040': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Daijuku',
    'latitude': 35.45306,
    'longitude': 140.03306
},
'12481050': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Mitsuzaku',
    'latitude': 35.41361,
    'longitude': 140.00583
},
'12481060': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Kuranami',
    'latitude': 35.43,
    'longitude': 140.02278
},
'12481070': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Yoshinoda',
    'latitude': 35.36139,
    'longitude': 140.01139
},
'12481080': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Yokota',
    'latitude': 35.38694,
    'longitude': 140.03694
},
'12481090': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Harai',
    'latitude': 35.42111,
    'longitude': 140.07222
},
'12481160': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Nagaura',
    'latitude': 35.44444,
    'longitude': 140.00694
},
'12481510': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Fukuodai(kuruma)',
    'latitude': 35.43167,
    'longitude': 139.97361
},
'12481520': {
    'prefecture': 'Chiba',
    'location': 'Sodegaura_Ozone(kuruma)',
    'latitude': 35.41833,
    'longitude': 140.01889
},
'13101010': {
    'prefecture': 'Tokyo',
    'location': 'Chiyoda-ku_Kandatsukasachou',
    'latitude': 35.68889,
    'longitude': 139.77222
},
'13101510': {
    'prefecture': 'Tokyo',
    'location': 'Hibiyakousaten',
    'latitude': 35.67222,
    'longitude': 139.76111
},
'13101520': {
    'prefecture': 'Tokyo',
    'location': 'Kokusetsu_kasumigaseki',
    'latitude': 35.66944,
    'longitude': 139.75639
},
'13102010': {
    'prefecture': 'Tokyo',
    'location': 'Chuuou-ku_Harumi',
    'latitude': 35.65278,
    'longitude': 139.78333
},
'13102510': {
    'prefecture': 'Tokyo',
    'location': 'Eidaidoori_sinkawa',
    'latitude': 35.675,
    'longitude': 139.78611
},
'13103010': {
    'prefecture': 'Tokyo',
    'location': 'Minatokutakanawa',
    'latitude': 35.64222,
    'longitude': 139.73583
},
'13103510': {
    'prefecture': 'Tokyo',
    'location': 'Daiichikeihintakanawa',
    'latitude': 35.63333,
    'longitude': 139.74167
},
'13104010': {
    'prefecture': 'Tokyo',
    'location': 'Kokusetsu_Tokyo(Shinjuku)',
    'latitude': 35.67778,
    'longitude': 139.71667
},
'13104520': {
    'prefecture': 'Tokyo',
    'location': 'Hatsudai',
    'latitude': 35.68056,
    'longitude': 139.68889
},
'13104540': {
    'prefecture': 'Tokyo',
    'location': 'Kokusetsu_Shinjuku',
    'latitude': 35.68139,
    'longitude': 139.71861
},
'13104550': {
    'prefecture': 'Tokyo',
    'location': 'Shinmejirodoori_shimoochiai',
    'latitude': 35.71389,
    'longitude': 139.70556
},
'13105010': {
    'prefecture': 'Tokyo',
    'location': 'Bunkyo-ku_Honkomagome',
    'latitude': 35.73056,
    'longitude': 139.75833
},
'13105520': {
    'prefecture': 'Tokyo',
    'location': 'Kasugadori_Koishikawa',
    'latitude': 35.70833,
    'longitude': 139.74722
},
'13105530': {
    'prefecture': 'Tokyo',
    'location': 'Kasugadooriootsuka',
    'latitude': 35.71944,
    'longitude': 139.73472
},
'13106520': {
    'prefecture': 'Tokyo',
    'location': 'Meijidoorioozekiyokocho',
    'latitude': 35.725,
    'longitude': 139.79722
},
'13107520': {
    'prefecture': 'Tokyo',
    'location': 'Mitokaidou_higasimukoujima',
    'latitude': 35.71667,
    'longitude': 139.81667
},
'13108010': {
    'prefecture': 'Tokyo',
    'location': 'Koto-ku_Ooshima',
    'latitude': 35.68611,
    'longitude': 139.83056
},
'13108020': {
    'prefecture': 'Tokyo',
    'location': 'Minato-ku_Daiba',
    'latitude': 35.63056,
    'longitude': 139.78056
},
'13108520': {
    'prefecture': 'Tokyo',
    'location': 'Keiyoudouro_kameido',
    'latitude': 35.69444,
    'longitude': 139.83889
},
'13108530': {
    'prefecture': 'Tokyo',
    'location': 'Mitsumedori_tatumi',
    'latitude': 35.64722,
    'longitude': 139.81389
},
'13109010': {
    'prefecture': 'Tokyo',
    'location': 'Shinagawa-ku_Yutakachou',
    'latitude': 35.60833,
    'longitude': 139.725
},
'13109030': {
    'prefecture': 'Tokyo',
    'location': 'Shinagawa-ku_Yashio',
    'latitude': 35.59722,
    'longitude': 139.75556
},
'13109510': {
    'prefecture': 'Tokyo',
    'location': 'Kitashinagawa_kousaten',
    'latitude': 35.61389,
    'longitude': 139.74444
},
'13109520': {
    'prefecture': 'Tokyo',
    'location': 'Nakaharaguchi',
    'latitude': 35.61667,
    'longitude': 139.72222
},
'13110010': {
    'prefecture': 'Tokyo',
    'location': 'Meguro-ku_Himonya',
    'latitude': 35.61667,
    'longitude': 139.68611
},
'13110510': {
    'prefecture': 'Tokyo',
    'location': 'Oosakabashi',
    'latitude': 35.65,
    'longitude': 139.69167
},
'13110530': {
    'prefecture': 'Tokyo',
    'location': 'Kakinokizaka',
    'latitude': 35.62028,
    'longitude': 139.68167
},
'13111010': {
    'prefecture': 'Tokyo',
    'location': 'Ota-ku_Higashikoujiya',
    'latitude': 35.55556,
    'longitude': 139.74167
},
'13111520': {
    'prefecture': 'Tokyo',
    'location': 'Kannanadoori_matsubarabashi',
    'latitude': 35.59167,
    'longitude': 139.71389
},
'13111530': {
    'prefecture': 'Tokyo',
    'location': 'Nkaharakaidouminamisenzuka',
    'latitude': 35.59722,
    'longitude': 139.69722
},
'13111540': {
    'prefecture': 'Tokyo',
    'location': 'Kanpachidoorichidori',
    'latitude': 35.57306,
    'longitude': 139.68639
},
'13112010': {
    'prefecture': 'Tokyo',
    'location': 'Setagaya-ku_Setagaya',
    'latitude': 35.64444,
    'longitude': 139.65556
},
'13112020': {
    'prefecture': 'Tokyo',
    'location': 'setagayakuseijou',
    'latitude': 35.65139,
    'longitude': 139.59361
},
'13112510': {
    'prefecture': 'Tokyo',
    'location': 'Tamagawadoorikamiuma',
    'latitude': 35.63333,
    'longitude': 139.66667
},
'13112520': {
    'prefecture': 'Tokyo',
    'location': 'Kanpachidoorihachimanyama',
    'latitude': 35.66111,
    'longitude': 139.61667
},
'13113010': {
    'prefecture': 'Tokyo',
    'location': 'Shibuya-ku_Udagawachou',
    'latitude': 35.66111,
    'longitude': 139.70278
},
'13113510': {
    'prefecture': 'Tokyo',
    'location': 'Oohara',
    'latitude': 35.66944,
    'longitude': 139.66389
},
'13114010': {
    'prefecture': 'Tokyo',
    'location': 'Nakano-ku_Wakamiya',
    'latitude': 35.71667,
    'longitude': 139.64722
},
'13114510': {
    'prefecture': 'Tokyo',
    'location': 'Yaamtedoorihigashiankano',
    'latitude': 35.70028,
    'longitude': 139.68278
},
'13115010': {
    'prefecture': 'Tokyo',
    'location': 'Suginami-ku_Kugayama',
    'latitude': 35.68611,
    'longitude': 139.60556
},
'13115520': {
    'prefecture': 'Tokyo',
    'location': 'Igusa',
    'latitude': 35.725,
    'longitude': 139.61667
},
'13115550': {
    'prefecture': 'Tokyo',
    'location': 'Wasedadoorishimoigusa',
    'latitude': 35.71667,
    'longitude': 139.62222
},
'13116530': {
    'prefecture': 'Toukyo',
    'location': 'Meijidoorinishisugamo',
    'latitude': 35.73861,
    'longitude': 139.72944
},
'13117520': {
    'prefecture': 'Tokyo',
    'location': 'Kitahondoori_Ouji',
    'latitude': 35.76389,
    'longitude': 139.73889
},
'13118010': {
    'prefecture': 'Tokyo',
    'location': 'Arakawa-ku_Minami-Senju',
    'latitude': 35.73056,
    'longitude': 139.79167
},
'13119010': {
    'prefecture': 'Tokyo',
    'location': 'itabashi-ku hikawacho',
    'latitude': 35.75361,
    'longitude': 139.7075
},
'13119510': {
    'prefecture': 'Tokyo',
    'location': 'Nakasendou_Yamatochou',
    'latitude': 35.75833,
    'longitude': 139.70833
},
'13120010': {
    'prefecture': 'Tokyo',
    'location': 'Nerima-ku_Kitamachi',
    'latitude': 35.76111,
    'longitude': 139.66667
},
'13120020': {
    'prefecture': 'Tokyo',
    'location': 'Nerima-ku_Shakujiidai',
    'latitude': 35.73333,
    'longitude': 139.60278
},
'13120030': {
    'prefecture': 'Tokyo',
    'location': 'nerimakunerima',
    'latitude': 35.74333,
    'longitude': 139.65361
},
'13121010': {
    'prefecture': 'Tokyo',
    'location': 'Adachi-ku_Nishiarai',
    'latitude': 35.77778,
    'longitude': 139.78056
},
'13121020': {
    'prefecture': 'Toukyo',
    'location': 'Adachikuayase',
    'latitude': 35.76694,
    'longitude': 139.82917
},
'13121510': {
    'prefecture': 'Tokyo',
    'location': 'Umejima',
    'latitude': 35.77222,
    'longitude': 139.80556
},
'13122010': {
    'prefecture': 'Tokyo',
    'location': 'Katsushika-ku_Kamakura',
    'latitude': 35.74167,
    'longitude': 139.88056
},
'13122020': {
    'prefecture': 'Tokyo',
    'location': 'katsusikakumizumotokouen',
    'latitude': 35.78611,
    'longitude': 139.86889
},
'13122520': {
    'prefecture': 'Tokyo',
    'location': 'Kannanadoori_Kameari',
    'latitude': 35.76111,
    'longitude': 139.85556
},
'13123010': {
    'prefecture': 'Tokyo',
    'location': 'Edogawa-ku_ShiShibone',
    'latitude': 35.70556,
    'longitude': 139.88889
},
'13123020': {
    'prefecture': 'Tokyo',
    'location': 'Edogawa-ku_Haruechou',
    'latitude': 35.67778,
    'longitude': 139.88056
},
'13123030': {
    'prefecture': 'Tokyo',
    'location': 'Edogawa-ku_Minami-Kasai',
    'latitude': 35.65,
    'longitude': 139.87222
},
'13201020': {
    'prefecture': 'Tokyo',
    'location': 'hachioujishi_katakuramachi',
    'latitude': 35.64167,
    'longitude': 139.34167
},
'13201040': {
    'prefecture': 'Tokyo',
    'location': 'Hachioujishitatemachi',
    'latitude': 35.62556,
    'longitude': 139.29139
},
'13201060': {
    'prefecture': 'Tokyo',
    'location': 'hachioujishidairakuji',
    'latitude': 35.67111,
    'longitude': 139.29278
},
'13201510': {
    'prefecture': 'Tokyo',
    'location': 'koushyukaidouyagichou',
    'latitude': 35.66167,
    'longitude': 139.32167
},
'13202010': {
    'prefecture': 'Tokyo',
    'location': 'Tachikawashi_izumichou',
    'latitude': 35.69167,
    'longitude': 139.42222
},
'13203010': {
    'prefecture': 'Tokyo',
    'location': 'Musashinoshi_sekimae',
    'latitude': 35.71111,
    'longitude': 139.55833
},
'13203510': {
    'prefecture': 'Tokyo',
    'location': 'Musashisakai',
    'latitude': 35.70833,
    'longitude': 139.54167
},
'13204510': {
    'prefecture': 'Tokyo',
    'location': 'Renjakudoori_shimorenjaku',
    'latitude': 35.68889,
    'longitude': 139.56389
},
'13205010': {
    'prefecture': 'Tokyo',
    'location': 'Oume-shi_higashioume',
    'latitude': 35.78611,
    'longitude': 139.27778
},
'13206010': {
    'prefecture': 'Tokyo',
    'location': 'Fuchuu-shi_Miyanishichou',
    'latitude': 35.66667,
    'longitude': 139.48056
},
'13208020': {
    'prefecture': 'Tokyo',
    'location': 'Choufu-shi_Jindaijimachi',
    'latitude': 35.66389,
    'longitude': 139.55833
},
'13209010': {
    'prefecture': 'Tokyo',
    'location': 'Machidashi-Kanamori',
    'latitude': 35.66639,
    'longitude': 139.45028
},
'13209020': {
    'prefecture': 'Tokyo',
    'location': 'Machidashi-nougayachou',
    'latitude': 35.58889,
    'longitude': 139.48611
},
'13210010': {
    'prefecture': 'Tokyo',
    'location': 'Koganeishi-honchou',
    'latitude': 35.69722,
    'longitude': 139.50556
},
'13211010': {
    'prefecture': 'Tokyo',
    'location': 'Kodairashi-ogawatyou',
    'latitude': 35.725,
    'longitude': 139.48056
},
'13212520': {
    'prefecture': 'Tokyo',
    'location': 'Kawasakikaido_Mogusaen',
    'latitude': 35.65278,
    'longitude': 139.43611
},
'13213510': {
    'prefecture': 'Tokyo',
    'location': 'Shinoumekaidou_higashimurayama',
    'latitude': 35.75,
    'longitude': 139.46944
},
'13215510': {
    'prefecture': 'Tokyo',
    'location': 'Kunitachi',
    'latitude': 35.67778,
    'longitude': 139.43611
},
'13216010': {
    'prefecture': 'Tokyo',
    'location': 'Tanashi-shi_Honchou',
    'latitude': 35.725,
    'longitude': 139.53889
},
'13217010': {
    'prefecture': 'Tokyo',
    'location': 'Nishitoukyoshishimohouya',
    'latitude': 35.75,
    'longitude': 139.55833
},
'13217510': {
    'prefecture': 'Tokyo',
    'location': 'Oumekaido_Yagisawa',
    'latitude': 35.72222,
    'longitude': 139.55556
},
'13218010': {
    'prefecture': 'Tokyo',
    'location': 'Fussa-shi_Honchou',
    'latitude': 35.73611,
    'longitude': 139.33056
},
'13219010': {
    'prefecture': 'Tokyo',
    'location': 'Komae-shi_nakaizumi',
    'latitude': 35.63056,
    'longitude': 139.575
},
'13220010': {
    'prefecture': 'Tokyo',
    'location': 'Higashiyamato-shi_narabashi',
    'latitude': 35.74722,
    'longitude': 139.42778
},
'13221010': {
    'prefecture': 'Tokyo',
    'location': 'Kiyose-shi_kiyoto',
    'latitude': 35.77778,
    'longitude': 139.525
},
'13222510': {
    'prefecture': 'Tokyo',
    'location': 'Koganei_kaidou_Higashikurume',
    'latitude': 35.75,
    'longitude': 139.51944
},
'13224010': {
    'prefecture': 'Tokyo',
    'location': 'Tama-shi_atago',
    'latitude': 35.63056,
    'longitude': 139.43611
},
'13303520': {
    'prefecture': 'Tokyo',
    'location': 'Tokyo_kanjou_Nagaoka',
    'latitude': 35.77222,
    'longitude': 139.33889
},
'13421950': {
    'prefecture': 'Tokyo',
    'location': 'Kokusetsu_Ogasawara',
    'latitude': 27.09167,
    'longitude': 142.21611
},
'14101010': {
    'prefecture': 'Kanagawa',
    'location': 'Tsurumi-ku_Ushioda_kouryuu_puraza',
    'latitude': 35.50028,
    'longitude': 139.68472
},
'14101020': {
    'prefecture': 'Kanagawa',
    'location': 'Tsurumi-ku_Namamugi_shougakkou',
    'latitude': 35.49556,
    'longitude': 139.67139
},
'14101520': {
    'prefecture': 'Kanagawa',
    'location': 'Tsurumi-ku_Shimosueyoshi_shougakkou',
    'latitude': 35.52278,
    'longitude': 139.67472
},
'14102010': {
    'prefecture': 'Kanagawa',
    'location': 'Kanagawa-ku_sougouchousha',
    'latitude': 35.47722,
    'longitude': 139.62917
},
'14103010': {
    'prefecture': 'Kanagawa',
    'location': 'Nishi-ku_Hiranuma_shougakkou',
    'latitude': 35.45778,
    'longitude': 139.61528
},
'14103510': {
    'prefecture': 'Kanagawa',
    'location': 'Nishi-ku_Sengenshita_kousaten',
    'latitude': 35.46556,
    'longitude': 139.61167
},
'14104020': {
    'prefecture': 'Kanagawa',
    'location': 'Naka-ku_Kasodai',
    'latitude': 35.42,
    'longitude': 139.64806
},
'14104030': {
    'prefecture': 'Kanagawa',
    'location': 'Naka-ku_Honmoku',
    'latitude': 35.41444,
    'longitude': 139.66167
},
'14105020': {
    'prefecture': 'Kanagawa',
    'location': 'Minami-ku_Yokohama_shougyoukoukou',
    'latitude': 35.43278,
    'longitude': 139.60889
},
'14106010': {
    'prefecture': 'Kanagawa',
    'location': 'Hotogaya-ku_Sakuragaoka_koukou',
    'latitude': 35.45111,
    'longitude': 139.58583
},
'14107010': {
    'prefecture': 'Kanagawa',
    'location': 'Isogo-ku_sougouchousha',
    'latitude': 35.40222,
    'longitude': 139.61806
},
'14107520': {
    'prefecture': 'Kanagawa',
    'location': 'Isogo-ku_Takigashira',
    'latitude': 35.42056,
    'longitude': 139.625
},
'14108020': {
    'prefecture': 'Kanagawa',
    'location': 'Kanazawa-ku_Nagahama',
    'latitude': 35.36222,
    'longitude': 139.63333
},
'14109040': {
    'prefecture': 'Kanagawa',
    'location': 'Kohoku-ku_sogochousha',
    'latitude': 35.51917,
    'longitude': 139.63333
},
'14110050': {
    'prefecture': 'Kanagawa',
    'location': 'Totsuka-ku_Gumizawa_shougakkou',
    'latitude': 35.39778,
    'longitude': 139.51444
},
'14110510': {
    'prefecture': 'Kanagawa',
    'location': 'Totsuka-ku_Yazawa_kousaten',
    'latitude': 35.39861,
    'longitude': 139.52778
},
'14111020': {
    'prefecture': 'Kanagawa',
    'location': 'Kounan-ku_Noba_chuugakkou',
    'latitude': 35.3875,
    'longitude': 139.57056
},
'14111520': {
    'prefecture': 'Kanagawa',
    'location': 'Kounan_chuugakkou',
    'latitude': 35.40111,
    'longitude': 139.59056
},
'14112020': {
    'prefecture': 'Kanagawa',
    'location': 'Asahi-ku_Tsurugamine_shougakkou',
    'latitude': 35.47222,
    'longitude': 139.55139
},
'14112510': {
    'prefecture': 'Kanagawa',
    'location': 'Asahi-ku_Tsuoka_shougakkou',
    'latitude': 35.48556,
    'longitude': 139.52194
},
'14113020': {
    'prefecture': 'Kanagawa',
    'location': 'Midori-ku_Miho_shougakkou',
    'latitude': 35.51611,
    'longitude': 139.52694
},
'14113510': {
    'prefecture': 'Kanagawa',
    'location': 'Aobadai',
    'latitude': 35.54,
    'longitude': 139.51472
},
'14113520': {
    'prefecture': 'Kanagawa',
    'location': 'ShigenJunkan_Tsuzuki_koujou_mae',
    'latitude': 35.53611,
    'longitude': 139.56806
},
'14114020': {
    'prefecture': 'Kanagawa',
    'location': 'Minamiseya_shougakkou',
    'latitude': 35.4575,
    'longitude': 139.48611
},
'14115010': {
    'prefecture': 'Kanagawa',
    'location': 'Sakae-ku_Kamigou_shougakkou',
    'latitude': 35.35861,
    'longitude': 139.5725
},
'14116010': {
    'prefecture': 'Kanagawa',
    'location': 'Izumi-ku_sougouchousha',
    'latitude': 35.4175,
    'longitude': 139.48861
},
'14117010': {
    'prefecture': 'Kanagawa',
    'location': 'Aoba-ku_sougouchousha',
    'latitude': 35.5525,
    'longitude': 139.53722
},
'14118010': {
    'prefecture': 'Kanagawa',
    'location': 'Tsuzuki-ku_sougouchousha',
    'latitude': 35.54472,
    'longitude': 139.57028
},
'14131020': {
    'prefecture': 'Kanagawa',
    'location': 'Daishi_kenkouburanchi',
    'latitude': 35.52861,
    'longitude': 139.73722
},
'14131030': {
    'prefecture': 'Kanagawa',
    'location': 'Kokusetsu_Kawasaki',
    'latitude': 35.51194,
    'longitude': 139.71528
},
'14131100': {
    'prefecture': 'Kanagawa',
    'location': 'kawasakisiyakusyodai4tyousya',
    'latitude': 35.53194,
    'longitude': 139.70361
},
'14131510': {
    'prefecture': 'Kanagawa',
    'location': 'Kawasaki_shiyakusho_mae',
    'latitude': 35.52722,
    'longitude': 139.70667
},
'14131520': {
    'prefecture': 'Kanagawa',
    'location': 'Shinkawadoori_kousaten',
    'latitude': 35.52333,
    'longitude': 139.705
},
'14131530': {
    'prefecture': 'Kanagawa',
    'location': 'Ikegamishinden_kouen_mae',
    'latitude': 35.51806,
    'longitude': 139.73278
},
'14131540': {
    'prefecture': 'Kanagawa',
    'location': 'Nisshinchou',
    'latitude': 35.52333,
    'longitude': 139.69528
},
'14132020': {
    'prefecture': 'Kanagawa',
    'location': 'Saiwaikuyakusho_hokenfukushisenta',
    'latitude': 35.54139,
    'longitude': 139.69611
},
'14132060': {
    'prefecture': 'Kanagawa',
    'location': 'Saiwaisupotsusenta',
    'latitude': 35.54417,
    'longitude': 139.68583
},
'14132510': {
    'prefecture': 'Kanagawa',
    'location': 'Endouchou_kousaten',
    'latitude': 35.54056,
    'longitude': 139.69472
},
'14133010': {
    'prefecture': 'Kanagawa',
    'location': 'Nakaharakuyakushohokenfukushisenta',
    'latitude': 35.57278,
    'longitude': 139.65917
},
'14133520': {
    'prefecture': 'Kanagawa',
    'location': 'Nakahara_heiwakouen',
    'latitude': 35.56361,
    'longitude': 139.66083
},
'14134010': {
    'prefecture': 'Kanagawa',
    'location': 'Seikatsu_bunka_kaikan',
    'latitude': 35.59556,
    'longitude': 139.61722
},
'14134050': {
    'prefecture': 'Kanagawa',
    'location': 'Saginuma_puuru',
    'latitude': 35.58028,
    'longitude': 139.57889
},
'14134520': {
    'prefecture': 'Kanagawa',
    'location': 'Maginu_kousaten',
    'latitude': 35.57889,
    'longitude': 139.59861
},
'14134530': {
    'prefecture': 'Kanagawa',
    'location': 'Futako',
    'latitude': 35.605,
    'longitude': 139.6175
},
'14135070': {
    'prefecture': 'Kanagawa',
    'location': 'Koubounomatsu_kouen',
    'latitude': 35.59889,
    'longitude': 139.51889
},
'14135080': {
    'prefecture': 'Kanagawa',
    'location': 'Noborito_shougakkou',
    'latitude': 35.61861,
    'longitude': 139.5625
},
'14135530': {
    'prefecture': 'Kanagawa',
    'location': 'Kakio',
    'latitude': 35.58806,
    'longitude': 139.50056
},
'14135540': {
    'prefecture': 'Kanagawa',
    'location': 'Honmurabashi',
    'latitude': 35.60944,
    'longitude': 139.57333
},
'14136010': {
    'prefecture': 'Kanagawa',
    'location': 'Miyamaedairashougakkou',
    'latitude': 35.58944,
    'longitude': 139.58611
},
'14136510': {
    'prefecture': 'Kanagawa',
    'location': 'Miyamaedaira_Ekimae',
    'latitude': 35.58167,
    'longitude': 139.58333
},
'14153510': {
    'prefecture': 'Kanagawa',
    'location': 'Kobuchi',
    'latitude': 35.55139,
    'longitude': 139.41917
},
'14201020': {
    'prefecture': 'Kanagawa',
    'location': 'Oppama_gyouseisenta',
    'latitude': 35.31444,
    'longitude': 139.63472
},
'14201040': {
    'prefecture': 'Kanagawa',
    'location': 'Nishi_gyouseisenta',
    'latitude': 35.21944,
    'longitude': 139.63167
},
'14201050': {
    'prefecture': 'Kanagawa',
    'location': 'Kurihama_gyouseisenta',
    'latitude': 35.225,
    'longitude': 139.70833
},
'14201530': {
    'prefecture': 'Kanagawa',
    'location': 'Ogawachokosaten',
    'latitude': 35.28278,
    'longitude': 139.67028
},
'14203030': {
    'prefecture': 'Kanagawa',
    'location': 'Kandashougakkou',
    'latitude': 35.37694,
    'longitude': 139.36278
},
'14203040': {
    'prefecture': 'Kanagawa',
    'location': 'asahisyougakkou',
    'latitude': 35.33556,
    'longitude': 139.30806
},
'14203050': {
    'prefecture': 'Kanagawa',
    'location': 'Hanamizushougakkou',
    'latitude': 35.31806,
    'longitude': 139.34556
},
'14203100': {
    'prefecture': 'Kanagawa',
    'location': 'oonokouminkan',
    'latitude': 35.35528,
    'longitude': 139.35472
},
'14203510': {
    'prefecture': 'Kanagawa',
    'location': 'Matsubara_hodoukyou',
    'latitude': 35.32972,
    'longitude': 139.35917
},
'14204010': {
    'prefecture': 'Kanagawa',
    'location': 'Kamakurashiyakusyo',
    'latitude': 35.31611,
    'longitude': 139.55
},
'14204530': {
    'prefecture': 'Kanagawa',
    'location': 'Kamakura-shi_okamoto',
    'latitude': 35.34972,
    'longitude': 139.52056
},
'14205010': {
    'prefecture': 'Kanagawa',
    'location': 'Fujisawa_shiyakusho',
    'latitude': 35.33556,
    'longitude': 139.495
},
'14205030': {
    'prefecture': 'Kanagawa',
    'location': 'Shonandaishogakko',
    'latitude': 35.40083,
    'longitude': 139.46806
},
'14205040': {
    'prefecture': 'Kanagawa',
    'location': 'Goshomi_shougakkou',
    'latitude': 35.40861,
    'longitude': 139.43222
},
'14205050': {
    'prefecture': 'Kanagawa',
    'location': 'meijishimin center',
    'latitude': 35.34,
    'longitude': 139.44944
},
'14205510': {
    'prefecture': 'Kanagawa',
    'location': 'Fujisawabashi',
    'latitude': 35.3425,
    'longitude': 139.49
},
'14206010': {
    'prefecture': 'Kanagawa',
    'location': 'Odawarashiyakusyo',
    'latitude': 35.26111,
    'longitude': 139.15556
},
'14206510': {
    'prefecture': 'Kanagawa',
    'location': 'Odawarashiminkouminkan',
    'latitude': 35.24722,
    'longitude': 139.16222
},
'14207010': {
    'prefecture': 'Kanagawa',
    'location': 'Chigasakishiyakusyo',
    'latitude': 35.33083,
    'longitude': 139.40806
},
'14207510': {
    'prefecture': 'Kanagawa',
    'location': 'Chigasakiekimaekousaten',
    'latitude': 35.33,
    'longitude': 139.40806
},
'14208020': {
    'prefecture': 'Kanagawa',
    'location': 'Zushishiyakusyo',
    'latitude': 35.29222,
    'longitude': 139.58333
},
'14208520': {
    'prefecture': 'Kanagawa',
    'location': 'Shinzushiekimae',
    'latitude': 35.28944,
    'longitude': 139.58278
},
'14209010': {
    'prefecture': 'Kanagawa',
    'location': 'Sagamiharashiyakusyo',
    'latitude': 35.57194,
    'longitude': 139.37306
},
'14209020': {
    'prefecture': 'Kanagawa',
    'location': 'SAGAMIDAI',
    'latitude': 35.52222,
    'longitude': 139.40722
},
'14209030': {
    'prefecture': 'Kanagawa',
    'location': 'HASHIMOTO',
    'latitude': 35.59833,
    'longitude': 139.34333
},
'14209040': {
    'prefecture': 'Kanagawa',
    'location': 'Tana',
    'latitude': 35.545,
    'longitude': 139.3375
},
'14209050': {
    'prefecture': 'Kanagawa',
    'location': 'Tsukui',
    'latitude': 35.58639,
    'longitude': 139.25639
},
'14209530': {
    'prefecture': 'Kanagawa',
    'location': 'KAMIMIZO',
    'latitude': 35.54861,
    'longitude': 139.35639
},
'14210010': {
    'prefecture': 'Kanagawa',
    'location': 'Miurashimisaki',
    'latitude': 35.14139,
    'longitude': 139.62361
},
'14211010': {
    'prefecture': 'Kanagawa',
    'location': 'Hatanoshiyakusyo',
    'latitude': 35.37111,
    'longitude': 139.22556
},
'14211510': {
    'prefecture': 'Kanagawa',
    'location': 'Hatano-shi_honchou',
    'latitude': 35.36972,
    'longitude': 139.23167
},
'14212020': {
    'prefecture': 'Kanagawa',
    'location': 'Atsugi-shi_nakamachi',
    'latitude': 35.44333,
    'longitude': 139.36806
},
'14212520': {
    'prefecture': 'Kanagawa',
    'location': 'Atsugi-shi_kanedajinjya',
    'latitude': 35.46306,
    'longitude': 139.37111
},
'14212540': {
    'prefecture': 'Kanagawa',
    'location': 'AtsugishiMizuhikiSokuteikyoku',
    'latitude': 35.11167,
    'longitude': 139.35778
},
'14213010': {
    'prefecture': 'Kanagawa',
    'location': 'Yamatoshiyakusyo',
    'latitude': 35.48417,
    'longitude': 139.4625
},
'14213510': {
    'prefecture': 'Kanagawa',
    'location': 'Yamato-shi_fukamidaikousaten',
    'latitude': 35.46833,
    'longitude': 139.46917
},
'14214020': {
    'prefecture': 'Kanagawa',
    'location': 'Iseharashiyakusyo',
    'latitude': 35.4,
    'longitude': 139.31861
},
'14214510': {
    'prefecture': 'Kanagawa',
    'location': 'Isehara-shi_tanitooka',
    'latitude': 35.38694,
    'longitude': 139.28194
},
'14215010': {
    'prefecture': 'Kanagawa',
    'location': 'Ebinashiyakusyo',
    'latitude': 35.44361,
    'longitude': 139.39361
},
'14216020': {
    'prefecture': 'Kanagawa',
    'location': 'Zamashiyakusyo',
    'latitude': 35.48528,
    'longitude': 139.41056
},
'14217020': {
    'prefecture': 'Kanagawa',
    'location': 'Minamiasigara-shi_ikoma',
    'latitude': 35.3075,
    'longitude': 139.11889
},
'14218010': {
    'prefecture': 'Kanagawa',
    'location': 'Ayaseshiyakusyo',
    'latitude': 35.43389,
    'longitude': 139.42889
},
'14321010': {
    'prefecture': 'Kanagawa',
    'location': 'Samukawamachiyakuba',
    'latitude': 35.37278,
    'longitude': 139.38389
},
'14382010': {
    'prefecture': 'Kanagawa',
    'location': 'Hakonemachi_Miyagino_sokuteikyoku',
    'latitude': 35.25417,
    'longitude': 139.04972
},
'14401010': {
    'prefecture': 'Kanagawa',
    'location': 'Aikamachisumida',
    'latitude': 35.52556,
    'longitude': 139.32583
},
'15102510': {
    'prefecture': 'Niigata',
    'location': 'Higashiyamanoshita',
    'latitude': 37.93389,
    'longitude': 139.08972
},
'15108010': {
    'prefecture': 'Niigata',
    'location': 'Maki',
    'latitude': 37.75972,
    'longitude': 138.88333
},
'15201060': {
    'prefecture': 'Niigata',
    'location': 'Ooyama',
    'latitude': 37.93306,
    'longitude': 139.08278
},
'15201150': {
    'prefecture': 'Niigata',
    'location': 'Taroudai',
    'latitude': 37.97833,
    'longitude': 139.22389
},
'15201220': {
    'prefecture': 'Niigata',
    'location': 'Yamakido',
    'latitude': 37.91722,
    'longitude': 139.08194
},
'15201270': {
    'prefecture': 'Niigata',
    'location': 'Matuhama',
    'latitude': 37.95306,
    'longitude': 139.14611
},
'15201322': {
    'prefecture': 'Niigata',
    'location': 'Shiyakusyo',
    'latitude': 37.91278,
    'longitude': 139.03889
},
'15201390': {
    'prefecture': 'Niigata',
    'location': 'Sonoki',
    'latitude': 37.86056,
    'longitude': 139.04083
},
'15201410': {
    'prefecture': 'Niigata',
    'location': 'Sakaiwa',
    'latitude': 37.87722,
    'longitude': 138.98861
},
'15201420': {
    'prefecture': 'Miigata',
    'location': 'Toyosaka',
    'latitude': 37.91694,
    'longitude': 139.22722
},
'15201430': {
    'prefecture': 'Miigata',
    'location': 'Kameda',
    'latitude': 37.87194,
    'longitude': 139.10222
},
'15201560': {
    'prefecture': 'Niigata',
    'location': 'Chyouryou',
    'latitude': 37.91333,
    'longitude': 139.07389
},
'15201570': {
    'prefecture': 'Miigata',
    'location': 'Shirane',
    'latitude': 37.76389,
    'longitude': 139.01667
},
'15202080': {
    'prefecture': 'Niigata',
    'location': 'Nagaoka_kogyoukoukou',
    'latitude': 37.43583,
    'longitude': 138.84472
},
'15202510': {
    'prefecture': 'Niigata',
    'location': 'jookajihai',
    'latitude': 37.47389,
    'longitude': 138.86083
},
'15205060': {
    'prefecture': 'Niigata',
    'location': 'kashiwazaki',
    'latitude': 37.3675,
    'longitude': 138.57917
},
'15206050': {
    'prefecture': 'Niigata',
    'location': 'Shibata',
    'latitude': 37.95278,
    'longitude': 139.3325
},
'15207020': {
    'prefecture': 'Niigata',
    'location': 'Niitsu',
    'latitude': 37.7875,
    'longitude': 139.12417
},
'15212010': {
    'prefecture': 'Niigata',
    'location': 'murakami',
    'latitude': 38.22806,
    'longitude': 139.47417
},
'15213010': {
    'prefecture': 'Niigata',
    'location': 'tsubame',
    'latitude': 37.67222,
    'longitude': 138.91833
},
'15216010': {
    'prefecture': 'Niigata',
    'location': 'Itoigawa',
    'latitude': 37.03861,
    'longitude': 137.85778
},
'15217050': {
    'prefecture': 'Niigata',
    'location': 'Oosaki',
    'latitude': 37.03556,
    'longitude': 138.25861
},
'15222190': {
    'prefecture': 'Niigata',
    'location': 'Fukaya',
    'latitude': 37.16444,
    'longitude': 138.27667
},
'15224010': {
    'prefecture': 'Niigata',
    'location': 'sado',
    'latitude': 37.98639,
    'longitude': 138.39444
},
'15224950': {
    'prefecture': 'Niigata',
    'location': 'Kokusetsu_Sadoseki',
    'latitude': 38.24972,
    'longitude': 138.4
},
'15307020': {
    'prefecture': 'Niigata',
    'location': 'Shidaihama',
    'latitude': 38.00833,
    'longitude': 139.28389
},
'15307080': {
    'prefecture': 'Niigata',
    'location': 'Sugiyachi',
    'latitude': 37.96444,
    'longitude': 139.25028
},
'15310010': {
    'prefecture': 'Niigata',
    'location': 'Nakajyou',
    'latitude': 38.055,
    'longitude': 139.40917
},
'15463010': {
    'prefecture': 'Niigata',
    'location': 'muikamachi',
    'latitude': 37.05778,
    'longitude': 138.86861
},
'15543010': {
    'prefecture': 'Niigata',
    'location': 'Nishifukushima',
    'latitude': 37.1775,
    'longitude': 138.27111
},
'15563170': {
    'prefecture': 'Niigata',
    'location': 'Nunakawakouen',
    'latitude': 37.025,
    'longitude': 137.82139
},
'16201021': {
    'prefecture': 'Toyama',
    'location': 'Toyama_Shibazono',
    'latitude': 36.69472,
    'longitude': 137.20333
},
'16201110': {
    'prefecture': 'Toyama',
    'location': 'Toyama_Mizuhashi',
    'latitude': 36.74667,
    'longitude': 137.30778
},
'16201140': {
    'prefecture': 'Toyama',
    'location': 'Toyama_Ninagawa',
    'latitude': 36.65194,
    'longitude': 137.22444
},
'16201400': {
    'prefecture': 'Toyama',
    'location': 'Toyama_iwase',
    'latitude': 36.73889,
    'longitude': 137.235
},
'16201510': {
    'prefecture': 'Toyama',
    'location': 'Toyama_Joushi',
    'latitude': 36.68917,
    'longitude': 137.21528
},
'16201520': {
    'prefecture': 'Toyama',
    'location': 'Toyama_Toyota',
    'latitude': 36.72083,
    'longitude': 137.23944
},
'16202010': {
    'prefecture': 'Toyama',
    'location': 'Takaoka_Honmaru',
    'latitude': 36.75028,
    'longitude': 137.02861
},
'16202020': {
    'prefecture': 'Toyama',
    'location': 'Takaokatoide',
    'latitude': 36.67667,
    'longitude': 136.97667
},
'16202060': {
    'prefecture': 'Toyama',
    'location': 'Takaoka_fushiki',
    'latitude': 36.79222,
    'longitude': 137.05778
},
'16202520': {
    'prefecture': 'Toyama',
    'location': 'Takaokaootsubo',
    'latitude': 36.76083,
    'longitude': 137.01972
},
'16203030': {
    'prefecture': 'Toyama',
    'location': 'Shinminato_Ebie',
    'latitude': 36.76083,
    'longitude': 137.15139
},
'16203200': {
    'prefecture': 'Toyama',
    'location': 'shinminatomikasone',
    'latitude': 36.77472,
    'longitude': 137.08222
},
'16204090': {
    'prefecture': 'Toyama',
    'location': 'Uozu',
    'latitude': 36.82583,
    'longitude': 137.41028
},
'16205180': {
    'prefecture': 'Toyama',
    'location': 'Himi',
    'latitude': 36.83611,
    'longitude': 136.99417
},
'16206240': {
    'prefecture': 'Toyama',
    'location': 'Namerikawakamijima',
    'latitude': 36.74778,
    'longitude': 137.35333
},
'16207011': {
    'prefecture': 'Toyama',
    'location': 'Kurobe_Ueki',
    'latitude': 36.87917,
    'longitude': 137.44917
},
'16207510': {
    'prefecture': 'Toyama',
    'location': 'Kurobe_maezawa',
    'latitude': 36.85694,
    'longitude': 137.4475
},
'16208120': {
    'prefecture': 'Toyama',
    'location': 'Tonami',
    'latitude': 36.62583,
    'longitude': 136.99194
},
'16209100': {
    'prefecture': 'Toyama',
    'location': 'Oyabe',
    'latitude': 36.66917,
    'longitude': 136.87722
},
'16342060': {
    'prefecture': 'Toyama',
    'location': 'Nyuzen',
    'latitude': 36.93278,
    'longitude': 137.50861
},
'16362010': {
    'prefecture': 'Toyama',
    'location': 'Fuchuu_Hayahoshi',
    'latitude': 36.65722,
    'longitude': 137.155
},
'16362510': {
    'prefecture': 'Toyama',
    'location': 'Fuchuu_Tajima',
    'latitude': 36.66889,
    'longitude': 137.17972
},
'16381010': {
    'prefecture': 'Toyama',
    'location': 'Kosugi_Taikouyama',
    'latitude': 36.6975,
    'longitude': 137.10278
},
'16381510': {
    'prefecture': 'Toyama',
    'location': 'Kosugi_Washiduka',
    'latitude': 36.72722,
    'longitude': 137.12528
},
'16381520': {
    'prefecture': 'Toyama',
    'location': 'Kosugigejyou',
    'latitude': 36.70611,
    'longitude': 137.07972
},
'16408060': {
    'prefecture': 'Toyama',
    'location': 'Fukuno',
    'latitude': 36.58806,
    'longitude': 136.915
},
'17201090': {
    'prefecture': 'Ishikawa',
    'location': 'Nishinannbu',
    'latitude': 36.54944,
    'longitude': 136.60972
},
'17201110': {
    'prefecture': 'Ishikawa',
    'location': 'Kodatsuno',
    'latitude': 36.55333,
    'longitude': 136.68
},
'17201290': {
    'prefecture': 'Ishikawa',
    'location': 'tyuuou',
    'latitude': 36.56389,
    'longitude': 136.65472
},
'17201300': {
    'prefecture': 'Ishikawa',
    'location': 'Ekinishi',
    'latitude': 36.58639,
    'longitude': 136.64028
},
'17201310': {
    'prefecture': 'Ishikawa',
    'location': 'Seibu',
    'latitude': 36.59444,
    'longitude': 136.60722
},
'17201320': {
    'prefecture': 'Ishikawa',
    'location': 'Hokubu',
    'latitude': 36.59139,
    'longitude': 136.68
},
'17201550': {
    'prefecture': 'Ishikawa',
    'location': 'Musashi',
    'latitude': 36.56889,
    'longitude': 136.65833
},
'17201560': {
    'prefecture': 'Ishikawa',
    'location': 'Katamachi',
    'latitude': 36.55722,
    'longitude': 136.655
},
'17201650': {
    'prefecture': 'Ishikawa',
    'location': 'YAMASHINA',
    'latitude': 36.52861,
    'longitude': 136.65167
},
'17202190': {
    'prefecture': 'Ishikawa',
    'location': 'Nanao',
    'latitude': 37.04528,
    'longitude': 136.96139
},
'17202200': {
    'prefecture': 'Ishikawa',
    'location': 'Ishizaki',
    'latitude': 37.07778,
    'longitude': 136.93083
},
'17202240': {
    'prefecture': 'Ishikawa',
    'location': 'Oota',
    'latitude': 37.05167,
    'longitude': 137.00972
},
'17202250': {
    'prefecture': 'Ishikawa',
    'location': 'Sakiyama',
    'latitude': 37.09333,
    'longitude': 137.05
},
'17202260': {
    'prefecture': 'Ishikawa',
    'location': 'Tokuda',
    'latitude': 37.00861,
    'longitude': 136.95194
},
'17203140': {
    'prefecture': 'Ishikawa',
    'location': 'Komatsu',
    'latitude': 36.40528,
    'longitude': 136.46444
},
'17204010': {
    'prefecture': 'Ishikawa',
    'location': 'wajima',
    'latitude': 37.29528,
    'longitude': 136.95444
},
'17205020': {
    'prefecture': 'Ishikawa',
    'location': 'suzu',
    'latitude': 37.43944,
    'longitude': 137.26889
},
'17206010': {
    'prefecture': 'Ishikawa',
    'location': 'Daiseiji',
    'latitude': 36.29917,
    'longitude': 136.31833
},
'17206020': {
    'prefecture': 'Ishikawa',
    'location': 'Yamashiro',
    'latitude': 36.28917,
    'longitude': 136.36111
},
'17207010': {
    'prefecture': 'Ishikawa',
    'location': 'Hakuishi',
    'latitude': 36.88972,
    'longitude': 136.78139
},
'17208010': {
    'prefecture': 'Ishikawa',
    'location': 'Matsutou',
    'latitude': 36.51639,
    'longitude': 136.56306
},
'17208020': {
    'prefecture': 'Ishikawa',
    'location': 'Yamasima',
    'latitude': 36.46694,
    'longitude': 136.57861
},
'17321010': {
    'prefecture': 'Ishikawa',
    'location': 'Neagari',
    'latitude': 36.44333,
    'longitude': 136.45778
},
'17342010': {
    'prefecture': 'Ishikawa',
    'location': 'Yosikawa',
    'latitude': 36.4725,
    'longitude': 136.47833
},
'17344520': {
    'prefecture': 'Ishikawa',
    'location': 'Nonoshi',
    'latitude': 36.54639,
    'longitude': 136.60083
},
'17361010': {
    'prefecture': 'Ishikawa',
    'location': 'Tsubata',
    'latitude': 36.66417,
    'longitude': 136.73111
},
'17365010': {
    'prefecture': 'Ishikawa',
    'location': 'Uchinada',
    'latitude': 36.63167,
    'longitude': 136.63361
},
'17401010': {
    'prefecture': 'Ishikawa',
    'location': 'Tatsuruhama',
    'latitude': 37.05722,
    'longitude': 136.89639
},
'17404010': {
    'prefecture': 'Ishikawa',
    'location': 'Kashima',
    'latitude': 36.96222,
    'longitude': 136.92083
},
'17405010': {
    'prefecture': 'Ishikawa',
    'location': 'Notojima',
    'latitude': 37.12028,
    'longitude': 137.00194
},
'18201040': {
    'prefecture': 'Fukui',
    'location': 'Fukui',
    'latitude': 36.05389,
    'longitude': 136.22528
},
'18201060': {
    'prefecture': 'Fukui',
    'location': 'ishibashi',
    'latitude': 36.14722,
    'longitude': 136.1
},
'18201070': {
    'prefecture': 'Fukui',
    'location': 'okabo',
    'latitude': 36.04722,
    'longitude': 136.27667
},
'18201540': {
    'prefecture': 'Fukui',
    'location': 'Jihai_Fukui',
    'latitude': 36.03222,
    'longitude': 136.23139
},
'18202020': {
    'prefecture': 'Fukui',
    'location': 'Tsuruga',
    'latitude': 35.65056,
    'longitude': 136.065
},
'18202190': {
    'prefecture': 'Fukui',
    'location': 'Wakuno',
    'latitude': 35.62528,
    'longitude': 136.05583
},
'18202530': {
    'prefecture': 'Fukui',
    'location': 'Jihai_Tsuruga',
    'latitude': 35.62917,
    'longitude': 136.065
},
'18203010': {
    'prefecture': 'Fukui',
    'location': 'Takefu',
    'latitude': 35.90556,
    'longitude': 136.16056
},
'18203080': {
    'prefecture': 'Fukui',
    'location': 'Takefuminami',
    'latitude': 35.88361,
    'longitude': 136.16278
},
'18203100': {
    'prefecture': 'Fukui',
    'location': 'Ajimano',
    'latitude': 35.89194,
    'longitude': 136.2275
},
'18203110': {
    'prefecture': 'Fukui',
    'location': 'Takeokita',
    'latitude': 35.91778,
    'longitude': 136.17694
},
'18203120': {
    'prefecture': 'Fukui',
    'location': 'TAKEFUNISHI',
    'latitude': 35.87861,
    'longitude': 136.06639
},
'18204010': {
    'prefecture': 'Fukui',
    'location': 'Obama',
    'latitude': 35.49361,
    'longitude': 135.75306
},
'18205010': {
    'prefecture': 'Fukui',
    'location': 'Ohno',
    'latitude': 35.98833,
    'longitude': 136.49111
},
'18207010': {
    'prefecture': 'Fukui',
    'location': 'Shinmei',
    'latitude': 35.96583,
    'longitude': 136.1875
},
'18207050': {
    'prefecture': 'Fukui',
    'location': 'Miyuki',
    'latitude': 35.97583,
    'longitude': 136.19611
},
'18207080': {
    'prefecture': 'Fukui',
    'location': 'Sabae_higashi',
    'latitude': 35.93361,
    'longitude': 136.20194
},
'18207520': {
    'prefecture': 'Fukui',
    'location': 'Jihai_Tannan',
    'latitude': 35.95917,
    'longitude': 136.19083
},
'18361010': {
    'prefecture': 'Fukui',
    'location': 'Mikuni',
    'latitude': 36.18778,
    'longitude': 136.14583
},
'18362080': {
    'prefecture': 'Fukui',
    'location': 'Awara',
    'latitude': 36.21833,
    'longitude': 136.19833
},
'18363010': {
    'prefecture': 'Fukui',
    'location': 'Kanazu',
    'latitude': 36.20917,
    'longitude': 136.23139
},
'18363020': {
    'prefecture': 'Fukui',
    'location': 'Nakagawa',
    'latitude': 36.19361,
    'longitude': 136.27083
},
'18364020': {
    'prefecture': 'Fukui',
    'location': 'Kitamaruoka',
    'latitude': 36.16139,
    'longitude': 136.26972
},
'18365010': {
    'prefecture': 'Fukui',
    'location': 'Harue',
    'latitude': 36.1525,
    'longitude': 136.19167
},
'18366010': {
    'prefecture': 'Fukui',
    'location': 'Sakai',
    'latitude': 36.16194,
    'longitude': 136.22861
},
'18381010': {
    'prefecture': 'Fukui',
    'location': 'Imadate',
    'latitude': 35.91611,
    'longitude': 136.25056
},
'18441010': {
    'prefecture': 'Fukui',
    'location': 'Mikata',
    'latitude': 35.545,
    'longitude': 135.91167
},
'19201011': {
    'prefecture': 'Yamanashi',
    'location': 'kouhusiyakusyozihai',
    'latitude': 35.66222,
    'longitude': 138.56861
},
'19201020': {
    'prefecture': 'Yamanashi',
    'location': 'Kofufujimi',
    'latitude': 35.67194,
    'longitude': 138.55028
},
'19201510': {
    'prefecture': 'Yamanashi',
    'location': 'kokubojihai',
    'latitude': 35.63583,
    'longitude': 138.55806
},
'19202030': {
    'prefecture': 'Yamanashi',
    'location': 'Yoshida',
    'latitude': 35.48056,
    'longitude': 138.80083
},
'19204010': {
    'prefecture': 'Yamanashi',
    'location': 'Tsuru',
    'latitude': 35.54028,
    'longitude': 138.89694
},
'19205020': {
    'prefecture': 'Yamanashi',
    'location': 'Higashiyamanashi',
    'latitude': 35.70389,
    'longitude': 138.71389
},
'19206010': {
    'prefecture': 'Yamanashi',
    'location': 'Ootsuki',
    'latitude': 35.60861,
    'longitude': 138.93528
},
'19207030': {
    'prefecture': 'Yamanashi',
    'location': 'Nirasaki',
    'latitude': 35.70028,
    'longitude': 138.45694
},
'19214010': {
    'prefecture': 'Yamanashi',
    'latitude': 35.565,
    'longitude': 138.56583
},
'19321030': {
    'prefecture': 'Yamanashi',
    'location': 'Fuefuki',
    'latitude': 35.63917,
    'longitude': 138.67167
},
'19366010': {
    'prefecture': 'Yamanashi',
    'location': 'Nanbu',
    'latitude': 35.28472,
    'longitude': 138.45583
},
'19390030': {
    'prefecture': 'Yamanashi',
    'location': 'Minami_alps',
    'latitude': 35.60167,
    'longitude': 138.49861
},
'19441030': {
    'prefecture': 'Yamanashi',
    'location': 'Uenohara',
    'latitude': 35.63278,
    'longitude': 139.11
},
'20201030': {
    'prefecture': 'Nagano',
    'location': 'Kankyouhozenjkennkyuujyo',
    'latitude': 36.63639,
    'longitude': 138.18306
},
'20201070': {
    'prefecture': 'Nagano',
    'location': 'Yoshida',
    'latitude': 36.66361,
    'longitude': 138.22306
},
'20201110': {
    'prefecture': 'Nagano',
    'location': 'Shinonoi',
    'latitude': 36.57556,
    'longitude': 138.14472
},
'20201140': {
    'prefecture': 'Nagano',
    'location': 'Mashima',
    'latitude': 36.60278,
    'longitude': 138.20861
},
'20201150': {
    'prefecture': 'Nagano',
    'location': 'Toyono',
    'latitude': 36.71167,
    'longitude': 138.2825
},
'20201510': {
    'prefecture': 'Nagano',
    'location': 'Oshimada',
    'latitude': 36.59167,
    'longitude': 138.19111
},
'20201520': {
    'prefecture': 'Nagano',
    'location': 'Nabeyata',
    'latitude': 36.64667,
    'longitude': 138.19444
},
'20202050': {
    'prefecture': 'Nagano',
    'location': 'Matsumoto',
    'latitude': 36.23056,
    'longitude': 137.94722
},
'20202510': {
    'prefecture': 'Nagano',
    'location': 'Mastumotonagisa',
    'latitude': 36.22806,
    'longitude': 137.95861
},
'20203010': {
    'prefecture': 'Nagano',
    'location': 'Uedagoudoutyousya',
    'latitude': 36.39611,
    'longitude': 138.26306
},
'20204510': {
    'prefecture': 'Nagano',
    'location': 'Okayainta-tyenji',
    'latitude': 36.085,
    'longitude': 138.03778
},
'20205010': {
    'prefecture': 'Nagano',
    'location': 'Iidagoudoutyousya',
    'latitude': 35.51139,
    'longitude': 137.83194
},
'20205510': {
    'prefecture': 'Aichi',
    'location': 'Iidainta-tyenji',
    'latitude': 35.49722,
    'longitude': 137.80222
},
'20206010': {
    'prefecture': 'Nagano',
    'location': 'Suwagoudoutyousya',
    'latitude': 36.03639,
    'longitude': 138.10917
},
'20207010': {
    'prefecture': 'Nagano',
    'location': 'Suzaka',
    'latitude': 36.65083,
    'longitude': 138.31333
},
'20208020': {
    'prefecture': 'Nagano',
    'location': 'Komoro',
    'latitude': 36.32639,
    'longitude': 138.43667
},
'20209010': {
    'prefecture': 'Nagano',
    'location': 'Inasa_shougakkou',
    'latitude': 35.83639,
    'longitude': 137.935
},
'20211010': {
    'prefecture': 'Nagano',
    'location': 'Ina',
    'latitude': 36.74111,
    'longitude': 138.37083
},
'20212160': {
    'prefecture': 'Nagano',
    'location': 'oomachi',
    'latitude': 36.50083,
    'longitude': 137.86306
},
'20216510': {
    'prefecture': 'Nagano',
    'location': 'Kousyokuinta-tyenji',
    'latitude': 36.54639,
    'longitude': 138.12861
},
'20217020': {
    'prefecture': 'Nagano',
    'location': 'Saku',
    'latitude': 36.22528,
    'longitude': 138.47306
},
'20217510': {
    'prefecture': 'Nagasaki',
    'latitude': 36.27361,
    'longitude': 138.46583
},
'20421030': {
    'prefecture': 'Nagano',
    'location': 'Kiso',
    'latitude': 35.83917,
    'longitude': 137.68806
},
'20485950': {
    'prefecture': 'Nagano',
    'location': 'Kokusetsu_Happo_one',
    'latitude': 36.69667,
    'longitude': 137.79806
},
'21201010': {
    'prefecture': 'Gifu',
    'location': 'Gifu_Chuuou',
    'latitude': 35.42222,
    'longitude': 136.75889
},
'21201020': {
    'prefecture': 'Gifu',
    'location': 'Gifu_Nanbu',
    'latitude': 35.38194,
    'longitude': 136.75306
},
'21201030': {
    'prefecture': 'Gifu',
    'location': 'Gifu_Hokubu',
    'latitude': 35.45361,
    'longitude': 136.77556
},
'21201520': {
    'prefecture': 'Gifu',
    'location': 'Meitoku_jidosha_haigasu',
    'latitude': 35.42056,
    'longitude': 136.76111
},
'21202020': {
    'prefecture': 'Gifu',
    'location': 'Oogakichuuou',
    'latitude': 35.355,
    'longitude': 136.61444
},
'21202050': {
    'prefecture': 'Gifu',
    'location': 'Oogakinanbu',
    'latitude': 35.3375,
    'longitude': 136.62556
},
'21202510': {
    'prefecture': 'Gifu',
    'location': 'Oogakijidousyahaisyutugasusokuteikyoku',
    'latitude': 35.34944,
    'longitude': 136.62611
},
'21203010': {
    'prefecture': 'Gifu',
    'location': 'Takayama',
    'latitude': 36.14278,
    'longitude': 137.25556
},
'21205360': {
    'prefecture': 'Gifu',
    'location': 'ＳＥＫＩ',
    'latitude': 35.49222,
    'longitude': 136.91778
},
'21206010': {
    'prefecture': 'Gifu',
    'location': 'Nakatsukawa',
    'latitude': 35.48528,
    'longitude': 137.50333
},
'21208010': {
    'prefecture': 'Gifu',
    'location': 'Mizunami',
    'latitude': 35.36194,
    'longitude': 137.25583
},
'21209020': {
    'prefecture': 'Gifu',
    'location': 'Hashima',
    'latitude': 35.31667,
    'longitude': 136.70611
},
'21210501': {
    'prefecture': 'Gifu',
    'location': 'ENA',
    'latitude': 35.44972,
    'longitude': 137.43222
},
'21211010': {
    'prefecture': 'Gifu',
    'location': 'Minokamosokuteikyoku',
    'latitude': 35.45417,
    'longitude': 137.03389
},
'21212510': {
    'prefecture': 'Gifu',
    'location': 'Tokijidousyagasusokuteikyoku',
    'latitude': 35.35444,
    'longitude': 137.17861
},
'21213020': {
    'prefecture': 'Gifu',
    'location': 'Kakamigahara',
    'latitude': 35.40778,
    'longitude': 136.88278
},
'21214510': {
    'prefecture': 'Gifu',
    'location': 'Kanijidousyahaisyutugasusokuteikyoku',
    'latitude': 35.43,
    'longitude': 137.04778
},
'21215950': {
    'prefecture': 'Gifu',
    'location': 'Kokusetsu_Ijira',
    'latitude': 35.57222,
    'longitude': 136.69389
},
'21218010': {
    'prefecture': 'Gifu',
    'location': 'Motosu',
    'latitude': 35.43306,
    'longitude': 136.65778
},
'21220010': {
    'prefecture': 'Gifu',
    'location': 'GERO',
    'latitude': 35.88417,
    'longitude': 137.20722
},
'21541010': {
    'prefecture': 'Gifu',
    'location': 'Kasahahra',
    'latitude': 35.30583,
    'longitude': 137.17028
},
'22102010': {
    'prefecture': 'Shizuoka',
    'location': 'minamichugakkou',
    'latitude': 34.95083,
    'longitude': 138.41806
},
'22103010': {
    'prefecture': 'Shizuoka',
    'location': 'shimizudainanachugakkou',
    'latitude': 35.00278,
    'longitude': 138.44722
},
'22132540': {
    'prefecture': 'Shizuoka',
    'location': 'hamamatsukanjosen',
    'latitude': 34.72889,
    'longitude': 137.78639
},
'22135010': {
    'prefecture': 'Shizuoka',
    'location': 'mikkabi',
    'latitude': 34.80278,
    'longitude': 137.55694
},
'22137010': {
    'prefecture': 'Shizuoka',
    'location': 'tenryusokuteikyoku',
    'latitude': 34.87333,
    'longitude': 137.81639
},
'22201030': {
    'prefecture': 'Shizuoka',
    'location': 'Shizuokasi_Chiyoda_shougakkou',
    'latitude': 34.99694,
    'longitude': 138.40778
},
'22201060': {
    'prefecture': 'Shizuoka',
    'location': 'Osana_Minami_chuugakkkou',
    'latitude': 34.93667,
    'longitude': 138.36889
},
'22201090': {
    'prefecture': 'Shizuoka',
    'location': 'Shizuokasi_Hattori_shougakkou',
    'latitude': 34.98528,
    'longitude': 138.33583
},
'22201500': {
    'prefecture': 'Shizuoka',
    'location': 'Tokiwakouen',
    'latitude': 34.97,
    'longitude': 138.37972
},
'22201530': {
    'prefecture': 'Shizuoka',
    'location': 'JIHAIMARIKO',
    'latitude': 34.94639,
    'longitude': 138.33
},
'22202040': {
    'prefecture': 'Shizuoka',
    'location': 'Chuuou_sokuteikyoku',
    'latitude': 34.70167,
    'longitude': 137.71583
},
'22202080': {
    'prefecture': 'Shizuoka',
    'location': 'Seibu_sokuteikyoku',
    'latitude': 34.72361,
    'longitude': 137.67278
},
'22202120': {
    'prefecture': 'Shizuoka',
    'location': 'Tohokubu_sokuteikyoku',
    'latitude': 34.75278,
    'longitude': 137.77528
},
'22202150': {
    'prefecture': 'Shizuoka',
    'location': 'Tounanbu_sokuteikyoku',
    'latitude': 34.69139,
    'longitude': 137.76944
},
'22202160': {
    'prefecture': 'Shizuoka',
    'location': 'Hokubu_sokuteikyoku',
    'latitude': 34.75861,
    'longitude': 137.72056
},
'22202520': {
    'prefecture': 'Shizuoka',
    'location': 'R-257',
    'latitude': 34.70194,
    'longitude': 137.73139
},
'22202530': {
    'prefecture': 'Shizuoka',
    'location': 'R-150',
    'latitude': 34.70333,
    'longitude': 137.75111
},
'22203010': {
    'prefecture': 'Shizuoka',
    'location': 'Toubusougouchousha',
    'latitude': 35.10722,
    'longitude': 138.85667
},
'22204010': {
    'prefecture': 'Shizuoka',
    'location': 'Shimizukuyakusho',
    'latitude': 35.01583,
    'longitude': 138.48972
},
'22204020': {
    'prefecture': 'Shizuoka',
    'location': 'Shimizumihodaiichishougakkou',
    'latitude': 34.99944,
    'longitude': 138.52917
},
'22204090': {
    'prefecture': 'Shizuoka',
    'location': 'Shimizuiharachuugakkou',
    'latitude': 35.05139,
    'longitude': 138.47972
},
'22204100': {
    'prefecture': 'Shizuoka',
    'location': 'Shimizuokitsukitakouen',
    'latitude': 35.05833,
    'longitude': 138.52778
},
'22204510': {
    'prefecture': 'Shizuoka',
    'location': 'Jihai_shinmei',
    'latitude': 35.04389,
    'longitude': 138.4725
},
'22205010': {
    'prefecture': 'Shizuoka',
    'location': 'atamisougoutyousya',
    'latitude': 35.0925,
    'longitude': 139.07194
},
'22206010': {
    'prefecture': 'Shizuoka',
    'location': 'Mishima_shiyakusho',
    'latitude': 35.11861,
    'longitude': 138.91861
},
'22206510': {
    'prefecture': 'Shizuoka',
    'location': 'Jihai_Mishima',
    'latitude': 35.11,
    'longitude': 138.91583
},
'22207010': {
    'prefecture': 'Shizuoka',
    'location': 'Fujinomiya_shiyakusho',
    'latitude': 35.22167,
    'longitude': 138.62417
},
'22207080': {
    'prefecture': 'Shizuoka',
    'location': 'Yamamiya_shougakkou',
    'latitude': 35.26667,
    'longitude': 138.63056
},
'22208020': {
    'prefecture': 'Shizuoka',
    'location': 'Itou_shiyakusho',
    'latitude': 34.96667,
    'longitude': 139.10083
},
'22209010': {
    'prefecture': 'Shizuoka',
    'location': 'Shimada_shiyakusho',
    'latitude': 34.83611,
    'longitude': 138.17639
},
'22210010': {
    'prefecture': 'Shizuoka',
    'location': 'Kyukyuiryousenta',
    'latitude': 35.15417,
    'longitude': 138.6775
},
'22210020': {
    'prefecture': 'Shizuoka',
    'location': 'Yoshiwara_dai3_chuugakkou',
    'latitude': 35.17083,
    'longitude': 138.71556
},
'22210030': {
    'prefecture': 'Shizuoka',
    'location': 'Fuji hiromishougakkou',
    'latitude': 35.18472,
    'longitude': 138.68556
},
'22210040': {
    'prefecture': 'Shizuoka',
    'location': 'Motoyoshiwara_chuugakkou',
    'latitude': 35.13861,
    'longitude': 138.70417
},
'22210050': {
    'prefecture': 'Shizuoka',
    'location': 'TAKAOKASYOUGAKKOU',
    'latitude': 35.19139,
    'longitude': 138.64917
},
'22210060': {
    'prefecture': 'Shizuoka',
    'location': 'Oobuchi_chuugakkou',
    'latitude': 35.20889,
    'longitude': 138.69
},
'22210070': {
    'prefecture': 'Shizuoka',
    'location': 'Fuji_chuugakkou',
    'latitude': 35.15972,
    'longitude': 138.65056
},
'22210160': {
    'prefecture': 'Shizuoka',
    'location': 'Higashi_shougakkou',
    'latitude': 35.14694,
    'longitude': 138.76722
},
'22210170': {
    'prefecture': 'Shizuoka',
    'location': 'MINAMIMATSUNO',
    'latitude': 35.17583,
    'longitude': 138.59972
},
'22210510': {
    'prefecture': 'Shizuoka',
    'location': 'Jihai_Tonoki',
    'latitude': 35.15278,
    'longitude': 138.66917
},
'22210520': {
    'prefecture': 'Shizuoka',
    'location': 'Jihai_Miyajima',
    'latitude': 35.13167,
    'longitude': 138.65556
},
'22211010': {
    'prefecture': 'Shizuoka',
    'location': 'Iwata_shiyakusho',
    'latitude': 34.71889,
    'longitude': 137.85028
},
'22212010': {
    'prefecture': 'Shizuoka',
    'location': 'Yaidu_shiyakusho',
    'latitude': 34.86472,
    'longitude': 138.31194
},
'22213010': {
    'prefecture': 'Shizuoka',
    'location': 'Kakegawa_shiyakusho',
    'latitude': 34.76889,
    'longitude': 137.99806
},
'22213510': {
    'prefecture': 'Shizuoka',
    'location': 'Jihai_Kakegawa',
    'latitude': 34.77889,
    'longitude': 138.01806
},
'22214010': {
    'prefecture': 'Shizuoka',
    'location': 'Taiki_sokuteishitsu',
    'latitude': 34.84472,
    'longitude': 138.27361
},
'22214510': {
    'prefecture': 'Shizuoka',
    'location': 'Jihai_Fujieda',
    'latitude': 34.87722,
    'longitude': 138.26722
},
'22215010': {
    'prefecture': 'Shizuoka',
    'location': 'Gotenba_shiyakusho',
    'latitude': 35.30861,
    'longitude': 138.93472
},
'22216010': {
    'prefecture': 'Shizuoka',
    'location': 'Fukuroi_shiyakusho',
    'latitude': 34.75111,
    'longitude': 137.92861
},
'22218010': {
    'prefecture': 'Shizuoka',
    'location': 'Hamakita_sokuteikyoku',
    'latitude': 34.78972,
    'longitude': 137.79444
},
'22219010': {
    'prefecture': 'Shizuoka',
    'location': 'Shimoda_shiyakusho',
    'latitude': 34.67944,
    'longitude': 138.94528
},
'22220010': {
    'prefecture': 'Shizuoka',
    'location': 'Susonoshiminbunkasenta-',
    'latitude': 35.19694,
    'longitude': 138.91361
},
'22221010': {
    'prefecture': 'Shizuoka',
    'location': 'Shiminkaikan',
    'latitude': 34.71889,
    'longitude': 137.53083
},
'22327010': {
    'prefecture': 'Shizuoka',
    'location': 'Oohito_kita_shougakkou',
    'latitude': 35.0175,
    'longitude': 138.94861
},
'22381010': {
    'prefecture': 'Shizuoka',
    'location': 'Fujikawa_dai1_chuugakkou',
    'latitude': 35.14889,
    'longitude': 138.6225
},
'22381020': {
    'prefecture': 'Shizuoka',
    'location': 'Fujigawa-chou_yakuba',
    'latitude': 35.14528,
    'longitude': 138.62222
},
'22382010': {
    'prefecture': 'Shizuoka',
    'location': 'kanbara',
    'latitude': 35.11889,
    'longitude': 138.585
},
'22383010': {
    'prefecture': 'Shizuoka',
    'location': 'Yui-chou_yakuba',
    'latitude': 35.10361,
    'longitude': 138.565
},
'22402010': {
    'prefecture': 'Shizuoka',
    'location': 'Oigawahigashishougakkou',
    'latitude': 34.80778,
    'longitude': 138.2925
},
'22423010': {
    'prefecture': 'Shizuoka',
    'location': 'Makinoharasi_Siyakusyo',
    'latitude': 34.73972,
    'longitude': 138.225
},
'22447010': {
    'prefecture': 'Shizuoka',
    'location': 'Kakegawasi_Daitousisyo',
    'latitude': 34.66611,
    'longitude': 138.055
},
'22522010': {
    'prefecture': 'Shizuoka',
    'location': 'Inasa-sokuteikyoku',
    'latitude': 34.83111,
    'longitude': 137.67139
},
'23101010': {
    'prefecture': 'Aichi',
    'location': 'Kokusetsu_Nagoya',
    'latitude': 35.175,
    'longitude': 136.97556
},
'23103011': {
    'prefecture': 'Aichi',
    'location': 'Jyougesuidoukyokueigyousyo',
    'latitude': 35.19361,
    'longitude': 136.91028
},
'23103020': {
    'prefecture': 'Aichi',
    'location': 'johoku tsubasa koukou',
    'latitude': 35.20778,
    'longitude': 136.90611
},
'23104510': {
    'prefecture': 'Aichi',
    'location': 'Nazukachuugakkou',
    'latitude': 35.2,
    'longitude': 136.8875
},
'23105050': {
    'prefecture': 'Aichi',
    'location': 'nakamura hoken senta',
    'latitude': 35.16667,
    'longitude': 136.86583
},
'23106018': {
    'prefecture': 'Aichi',
    'location': 'WAKAMIYAOODOURIKOUEN',
    'latitude': 35.27361,
    'longitude': 136.89806
},
'23107020': {
    'prefecture': 'Aichi',
    'location': 'Takigawasyougakkou',
    'latitude': 35.14111,
    'longitude': 136.96333
},
'23109020': {
    'prefecture': 'Aichi',
    'location': 'Hataya',
    'latitude': 35.12639,
    'longitude': 136.90778
},
'23109520': {
    'prefecture': 'Aichi',
    'location': 'Atsutajinguukouen',
    'latitude': 35.13083,
    'longitude': 136.90389
},
'23110040': {
    'prefecture': 'Aichi',
    'location': 'Yawatachuugakkou',
    'latitude': 35.13444,
    'longitude': 136.88333
},
'23110050': {
    'prefecture': 'Aichi',
    'location': 'Tomitashisyo',
    'latitude': 35.13694,
    'longitude': 136.81528
},
'23111010': {
    'prefecture': 'Aichi',
    'location': 'Ishinkoukou',
    'latitude': 35.10167,
    'longitude': 136.84556
},
'23111021': {
    'prefecture': 'Aichi',
    'location': 'Kouyou',
    'latitude': 35.09972,
    'longitude': 136.89028
},
'23112020': {
    'prefecture': 'Aichi',
    'location': 'Hakusuisyougakkou',
    'latitude': 35.07306,
    'longitude': 136.91667
},
'23112060': {
    'prefecture': 'Aichi',
    'location': 'Chikama',
    'latitude': 35.10556,
    'longitude': 136.92611
},
'23112510': {
    'prefecture': 'Aichi',
    'location': 'motoshiokouen',
    'latitude': 35.08056,
    'longitude': 136.92639
},
'23113010': {
    'prefecture': 'Aichi',
    'location': 'moriyama hoken senta',
    'latitude': 35.2,
    'longitude': 136.97917
},
'23114010': {
    'prefecture': 'Aichi',
    'location': 'Ootakakitasyougakkou',
    'latitude': 35.06639,
    'longitude': 136.94
},
'23116010': {
    'prefecture': 'Aichi',
    'location': 'tenpaku hoken senta',
    'latitude': 35.11889,
    'longitude': 136.9775
},
'23201030': {
    'prefecture': 'Aichi',
    'location': 'Oosaki',
    'latitude': 34.71222,
    'longitude': 137.34694
},
'23201040': {
    'prefecture': 'Aichi',
    'location': 'Ishimaki',
    'latitude': 34.78194,
    'longitude': 137.44167
},
'23201060': {
    'prefecture': 'Aichi',
    'location': 'Noyori',
    'latitude': 34.69889,
    'longitude': 137.39
},
'23201170': {
    'prefecture': 'Aichi',
    'location': 'futakawa',
    'latitude': 34.72194,
    'longitude': 137.45083
},
'23201520': {
    'prefecture': 'Aichi',
    'location': 'azuma',
    'latitude': 34.76056,
    'longitude': 137.41861
},
'23201540': {
    'prefecture': 'Aichi',
    'location': 'Imabashi',
    'latitude': 34.76639,
    'longitude': 137.39389
},
'23202020': {
    'prefecture': 'Aichi',
    'location': 'hane',
    'latitude': 34.92278,
    'longitude': 137.17611
},
'23202030': {
    'prefecture': 'Aichi',
    'location': 'tobukashiyama',
    'latitude': 34.91972,
    'longitude': 137.29111
},
'23202510': {
    'prefecture': 'Aichi',
    'location': 'Oohira',
    'latitude': 34.94361,
    'longitude': 137.19111
},
'23202550': {
    'prefecture': 'Aichi',
    'location': 'Yahagi',
    'latitude': 34.95889,
    'longitude': 137.145
},
'23202560': {
    'prefecture': 'Aichi',
    'location': 'Kamoda',
    'latitude': 34.98028,
    'longitude': 137.16417
},
'23203010': {
    'prefecture': 'Aichi',
    'location': 'Ichinomiyashimatufuridoori',
    'latitude': 35.31194,
    'longitude': 136.81139
},
'23204510': {
    'prefecture': 'Aichi',
    'location': 'Setoshitougentyou',
    'latitude': 35.21889,
    'longitude': 137.08972
},
'23205050': {
    'prefecture': 'Aichi',
    'location': 'Handashitouyouchou',
    'latitude': 34.89139,
    'longitude': 136.94083
},
'23206270': {
    'prefecture': 'Aichi',
    'location': 'kasugaisiasamiyakouen',
    'latitude': 35.25528,
    'longitude': 136.96
},
'23206520': {
    'prefecture': 'Aichi',
    'location': 'Chuuou_kouen',
    'latitude': 35.24139,
    'longitude': 136.9725
},
'23206530': {
    'prefecture': 'Aichi',
    'location': 'Kasugaishikatsukawasyougakkou',
    'latitude': 35.23583,
    'longitude': 136.95833
},
'23207010': {
    'prefecture': 'Aichi',
    'location': 'Toyokawashiyakusyo',
    'latitude': 34.82333,
    'longitude': 137.37972
},
'23207510': {
    'prefecture': 'Aichi',
    'location': 'Toyokawasi_sakuramati',
    'latitude': 34.81417,
    'longitude': 137.35139
},
'23208530': {
    'prefecture': 'Aichi',
    'location': 'Tsushima-shi_umedatyou',
    'latitude': 35.17028,
    'longitude': 136.74306
},
'23209080': {
    'prefecture': 'Aichi',
    'location': 'Hekinan-shi_kawaguchityou',
    'latitude': 34.835,
    'longitude': 136.98056
},
'23209510': {
    'prefecture': 'Aichi',
    'location': 'Hekinanshibunnkakaikan',
    'latitude': 34.88111,
    'longitude': 136.99944
},
'23210040': {
    'prefecture': 'Aichi',
    'location': 'Kariyashikotobukityou',
    'latitude': 34.98694,
    'longitude': 136.99944
},
'23211020': {
    'prefecture': 'Aichi',
    'location': 'Nanbukyoku(Takemototyou)',
    'latitude': 35.01889,
    'longitude': 137.12278
},
'23211040': {
    'prefecture': 'Aichi',
    'location': 'tyuubukyoku(sanngenntyou)',
    'latitude': 35.08167,
    'longitude': 137.14306
},
'23211050': {
    'prefecture': 'Aichi',
    'location': 'Hokubukyoku(kanoumachi)',
    'latitude': 35.15167,
    'longitude': 137.16583
},
'23211060': {
    'prefecture': 'Aichi',
    'location': 'Toubukyoku(houraimachi)',
    'latitude': 35.07972,
    'longitude': 137.19278
},
'23212030': {
    'prefecture': 'Aichi',
    'location': 'Anjounourinkoukou',
    'latitude': 34.96694,
    'longitude': 137.08139
},
'23213010': {
    'prefecture': 'Aichi',
    'location': 'Aikouhomunishioen',
    'latitude': 34.87611,
    'longitude': 137.08
},
'23214010': {
    'prefecture': 'Aichi',
    'location': 'Gamagoorishimiyukichou',
    'latitude': 34.82528,
    'longitude': 137.22472
},
'23215010': {
    'prefecture': 'Aichi',
    'location': 'Inuyamasyoubousyo',
    'latitude': 35.36056,
    'longitude': 136.94778
},
'23216110': {
    'prefecture': 'Aichi',
    'location': 'Tokoname jyouka senta-',
    'latitude': 34.88056,
    'longitude': 136.83139
},
'23217010': {
    'prefecture': 'Aichi',
    'location': 'Kounann-shi_kochinochou',
    'latitude': 35.33944,
    'longitude': 136.87028
},
'23218010': {
    'prefecture': 'Aichi',
    'location': 'Ichinomiya-shi_konobunakashima',
    'latitude': 35.30861,
    'longitude': 136.74944
},
'23219010': {
    'prefecture': 'Aichi',
    'location': 'Komakikoukou',
    'latitude': 35.29,
    'longitude': 136.92194
},
'23220510': {
    'prefecture': 'Aichi',
    'location': 'Inazawashiyakusyo',
    'latitude': 35.24417,
    'longitude': 136.7825
},
'23221010': {
    'prefecture': 'Aichi',
    'location': 'Shinshiroshishoubousho',
    'latitude': 34.72861,
    'longitude': 137.50667
},
'23222010': {
    'prefecture': 'Aichi',
    'location': 'Toukai-shi_nawamachi',
    'latitude': 35.04056,
    'longitude': 136.91583
},
'23222020': {
    'prefecture': 'Aichi',
    'location': 'Toukai-shi_yokosukasyougakkou',
    'latitude': 35.00917,
    'longitude': 136.8925
},
'23223010': {
    'prefecture': 'Aichi',
    'location': 'Oobusyougakkou',
    'latitude': 35.00944,
    'longitude': 136.9675
},
'23224030': {
    'prefecture': 'Aichi',
    'location': 'Chita-shi_shinmaikohoikuen',
    'latitude': 34.945,
    'longitude': 136.83444
},
'23225040': {
    'prefecture': 'Aichi',
    'location': 'Chitashiyakusyo',
    'latitude': 34.99861,
    'longitude': 137.05361
},
'23226010': {
    'prefecture': 'Aichi',
    'location': 'Owariasahi-shi_Higashi-Daidouchou',
    'latitude': 35.20972,
    'longitude': 137.03944
},
'23227010': {
    'prefecture': 'Aichi',
    'location': 'Takahamasyougakkou',
    'latitude': 34.92139,
    'longitude': 136.9925
},
'23228010': {
    'prefecture': 'Aichi',
    'location': 'Iwakura-shi_nakahonmachi',
    'latitude': 35.27806,
    'longitude': 136.88083
},
'23229010': {
    'prefecture': 'Aichi',
    'location': 'Toyoaketyuugakkou',
    'latitude': 35.05833,
    'longitude': 137.01056
},
'23230510': {
    'prefecture': 'Aichi',
    'location': 'Nisshinnsijyounouikesupo-tsukouen',
    'latitude': 35.12444,
    'longitude': 137.01889
},
'23233510': {
    'prefecture': 'Aichi',
    'location': 'Kiyosu-shi_abara',
    'latitude': 35.21639,
    'longitude': 136.8575
},
'23302010': {
    'prefecture': 'Aichi',
    'location': 'Tougouchouharuki',
    'latitude': 35.09,
    'longitude': 137.0575
},
'23303020': {
    'prefecture': 'Aichi',
    'location': 'Nissin-shi_gosikien',
    'latitude': 35.14917,
    'longitude': 137.06778
},
'23304010': {
    'prefecture': 'Aichi',
    'location': 'Nagakutetyuugakkou',
    'latitude': 35.17528,
    'longitude': 137.05389
},
'23341520': {
    'prefecture': 'Aichi',
    'location': 'Nishibiwajima_shougakkou',
    'latitude': 35.19556,
    'longitude': 136.86889
},
'23342010': {
    'prefecture': 'Aichi',
    'location': 'Toyoyamatyoutoyoba',
    'latitude': 35.24583,
    'longitude': 136.9175
},
'23342510': {
    'prefecture': 'Aichi',
    'location': 'Toyoyamatyousakaejidouyuen',
    'latitude': 35.25028,
    'longitude': 136.90833
},
'23381010': {
    'prefecture': 'Aichi',
    'location': 'Ichinomiya-shi_kisogawasyoubousyo',
    'latitude': 35.34389,
    'longitude': 136.77111
},
'23421010': {
    'prefecture': 'Aichi',
    'location': 'Ama-shi_ifukusyougakkou',
    'latitude': 35.15222,
    'longitude': 136.79694
},
'23422510': {
    'prefecture': 'Aichi',
    'location': 'Amashiinarikouen',
    'latitude': 35.17583,
    'longitude': 136.79194
},
'23425510': {
    'prefecture': 'Aichi',
    'location': 'Kanieyawata',
    'latitude': 35.12861,
    'longitude': 136.78139
},
'23427510': {
    'prefecture': 'Aichi',
    'location': 'Kokusetuasukajidousyakoutuukannkyousokuteijyo',
    'latitude': 35.07361,
    'longitude': 136.78972
},
'23428010': {
    'prefecture': 'Aichi',
    'location': 'Yatomishiyakusyo',
    'latitude': 35.10806,
    'longitude': 136.7225
},
'23441010': {
    'prefecture': 'Aichi',
    'location': 'Aguityuugakkou',
    'latitude': 34.92972,
    'longitude': 136.9175
},
'23442010': {
    'prefecture': 'Aichi',
    'location': 'Higashiuramachiyakuba',
    'latitude': 34.97333,
    'longitude': 136.96833
},
'23446020': {
    'prefecture': 'Aichi',
    'location': 'Mihamatyouokuda',
    'latitude': 34.78389,
    'longitude': 136.86083
},
'23447010': {
    'prefecture': 'Aichi',
    'location': 'Taketoyotyouyakuba',
    'latitude': 34.84889,
    'longitude': 136.91722
},
'23481010': {
    'prefecture': 'Aichi',
    'location': 'Nishioshiyakusyoissikisiyo',
    'latitude': 34.80917,
    'longitude': 137.03306
},
'23501010': {
    'prefecture': 'Aichi',
    'location': 'Koutasyougakkou',
    'latitude': 34.87528,
    'longitude': 137.17639
},
'23604010': {
    'prefecture': 'Aichi',
    'location': 'Toyoka-shi_mitonanbusyougakkou',
    'latitude': 34.80583,
    'longitude': 137.32278
},
'23621071': {
    'prefecture': 'Aichi',
    'location': 'Tahara shi doho shougakkou',
    'latitude': 34.69528,
    'longitude': 137.27972
},
'23623020': {
    'prefecture': 'Aichi',
    'location': 'Tabara-shi_kodatyou',
    'latitude': 34.62306,
    'longitude': 137.10917
},
'24201020': {
    'prefecture': 'Mie',
    'location': 'RINGYOUKENKYUUSHO',
    'latitude': 34.65833,
    'longitude': 136.37139
},
'24201030': {
    'prefecture': 'Mie',
    'location': 'TSUKOUBEHAISUIJYOU',
    'latitude': 34.74611,
    'longitude': 136.48778
},
'24202010': {
    'prefecture': 'Mie',
    'location': 'Isodu',
    'latitude': 34.92306,
    'longitude': 136.64583
},
'24202030': {
    'prefecture': 'Mie',
    'location': 'Mihama',
    'latitude': 34.94278,
    'longitude': 136.625
},
'24202050': {
    'prefecture': 'Mie',
    'location': 'Hokusei_koukou',
    'latitude': 35.00389,
    'longitude': 136.645
},
'24202060': {
    'prefecture': 'Mie',
    'location': 'Yokkaichi_shougyoukoukou',
    'latitude': 34.97722,
    'longitude': 136.59611
},
'24202360': {
    'prefecture': 'Mie',
    'location': 'Yokkaichi_Minami',
    'latitude': 34.93278,
    'longitude': 136.59889
},
'24202370': {
    'prefecture': 'Mie',
    'location': 'nishiasakecyuuggakou',
    'latitude': 35.03694,
    'longitude': 136.59694
},
'24202510': {
    'prefecture': 'Mie',
    'location': 'naya',
    'latitude': 34.96167,
    'longitude': 136.63694
},
'24202520': {
    'prefecture': 'Mie',
    'location': 'HIGASHIMEIHAN',
    'latitude': 34.99583,
    'longitude': 136.55472
},
'24202530': {
    'prefecture': 'Mie',
    'location': 'kitasyoubousyo',
    'latitude': 35.00139,
    'longitude': 136.65806
},
'24202540': {
    'prefecture': 'Mie',
    'location': 'ISAKA',
    'latitude': 35.03639,
    'longitude': 136.62694
},
'24203010': {
    'prefecture': 'Mie',
    'location': 'Ise_kousei_chuugakkou',
    'latitude': 34.50194,
    'longitude': 136.7075
},
'24204010': {
    'prefecture': 'Mie',
    'location': 'Matsuzaka_dai5_shougakkou',
    'latitude': 34.56167,
    'longitude': 136.53861
},
'24204510': {
    'prefecture': 'Mie',
    'location': 'KOKUDOU23GOUMTUSAKAMIKUMO',
    'latitude': 34.63528,
    'longitude': 136.51333
},
'24205010': {
    'prefecture': 'Mie',
    'location': 'kuwanaueno',
    'latitude': 35.06222,
    'longitude': 136.67389
},
'24205510': {
    'prefecture': 'Mie',
    'location': 'Kokudou258goukuwana',
    'latitude': 35.05472,
    'longitude': 136.67222
},
'24206020': {
    'prefecture': 'Mie',
    'location': 'Igamidorigaokachuugakkou',
    'latitude': 34.75889,
    'longitude': 136.14194
},
'24206030': {
    'prefecture': 'Mie',
    'location': 'ＩＧＡＴＳＵＧＥ',
    'latitude': 34.82583,
    'longitude': 136.21528
},
'24207020': {
    'prefecture': 'Mie',
    'location': 'Suzukasanjo_hoikusho',
    'latitude': 34.87778,
    'longitude': 136.55278
},
'24207510': {
    'prefecture': 'Mie',
    'location': 'Kokudou23gousuzuka',
    'latitude': 34.83806,
    'longitude': 136.58917
},
'24208010': {
    'prefecture': 'Mie',
    'location': 'Nabari_shougakkou',
    'latitude': 34.62194,
    'longitude': 136.09167
},
'24209210': {
    'prefecture': 'Mie',
    'location': 'Owase_ken_syokuinkousya',
    'latitude': 34.08,
    'longitude': 136.19139
},
'24210010': {
    'prefecture': 'Mie',
    'location': 'Kameyama_minami_hoikuen',
    'latitude': 34.84361,
    'longitude': 136.45389
},
'24210510': {
    'prefecture': 'Mie',
    'location': 'Kokudou25goukameyama',
    'latitude': 34.85611,
    'longitude': 136.41639
},
'24211010': {
    'prefecture': 'Mie',
    'location': 'Toba_koukou',
    'latitude': 34.46611,
    'longitude': 136.84778
},
'24212010': {
    'prefecture': 'Mie',
    'location': 'Kumano_Kimoto_chuugakkou',
    'latitude': 33.89167,
    'longitude': 136.09278
},
'24213010': {
    'prefecture': 'Mie',
    'location': 'tsu_risseishougakkou',
    'latitude': 34.67806,
    'longitude': 136.48806
},
'24215010': {
    'prefecture': 'Mie',
    'location': 'Ugata',
    'latitude': 34.32778,
    'longitude': 136.82833
},
'24323010': {
    'prefecture': 'Mie',
    'location': 'Daian_chuugakkou',
    'latitude': 35.10722,
    'longitude': 136.53694
},
'24341810': {
    'prefecture': 'Mie',
    'location': 'Gozaisyo',
    'latitude': 35.02,
    'longitude': 136.41778
},
'24342010': {
    'prefecture': 'Mie',
    'location': 'Kusu',
    'latitude': 34.90944,
    'longitude': 136.62722
},
'24344020': {
    'prefecture': 'Mie',
    'location': 'Kawagoeminamisyougakkou',
    'latitude': 35.02139,
    'longitude': 136.67167
},
'24442010': {
    'prefecture': 'Mie',
    'location': 'MYOUJYOUSHOUGAKKOU',
    'latitude': 34.52389,
    'longitude': 136.64361
},
'25201010': {
    'prefecture': 'Shiga',
    'location': 'Senta',
    'latitude': 34.9825,
    'longitude': 135.90167
},
'25201060': {
    'prefecture': 'Shiga',
    'location': 'SHIMOSAKAMOTO',
    'latitude': 35.06833,
    'longitude': 135.87944
},
'25201070': {
    'prefecture': 'Shiga',
    'location': 'FUJIO',
    'latitude': 34.99861,
    'longitude': 135.83806
},
'25201080': {
    'prefecture': 'Shiga',
    'location': 'KATATA',
    'latitude': 35.11389,
    'longitude': 135.91861
},
'25201090': {
    'prefecture': 'Shiga',
    'location': 'ZEZE',
    'latitude': 35.00278,
    'longitude': 135.89028
},
'25201510': {
    'prefecture': 'Shiga',
    'location': 'OSAKA',
    'latitude': 35.00194,
    'longitude': 135.86611
},
'25201540': {
    'prefecture': 'Shiga',
    'location': 'ISHIYAMA',
    'latitude': 34.95583,
    'longitude': 135.90889
},
'25201570': {
    'prefecture': 'Shiga',
    'location': 'Kamitanakami',
    'latitude': 34.95972,
    'longitude': 135.97139
},
'25202090': {
    'prefecture': 'Shiga',
    'location': 'Hikone',
    'latitude': 35.25194,
    'longitude': 136.23944
},
'25203020': {
    'prefecture': 'Shiga',
    'location': 'Nagahama',
    'latitude': 35.37444,
    'longitude': 136.28056
},
'25203030': {
    'prefecture': 'Shiga',
    'location': 'Nagaahma',
    'latitude': 35.38861,
    'longitude': 136.26694
},
'25204050': {
    'prefecture': 'Shiga',
    'location': 'Hachiman',
    'latitude': 35.12333,
    'longitude': 136.09833
},
'25205030': {
    'prefecture': 'Shiga',
    'location': 'Higashioumi',
    'latitude': 35.10306,
    'longitude': 136.20889
},
'25206030': {
    'prefecture': 'Shiga',
    'location': 'Kusatsu',
    'latitude': 35.01,
    'longitude': 135.95333
},
'25206510': {
    'prefecture': 'Shiga',
    'location': 'Jihaikusatsu',
    'latitude': 35.01139,
    'longitude': 135.96083
},
'25207010': {
    'prefecture': 'Shiga',
    'location': 'Moriyama',
    'latitude': 35.06,
    'longitude': 135.98889
},
'25209010': {
    'prefecture': 'Shiga',
    'location': 'KOKA',
    'latitude': 34.96444,
    'longitude': 136.165
},
'25212010': {
    'prefecture': 'Shiga',
    'location': 'Takashima',
    'latitude': 35.40472,
    'longitude': 136.03889
},
'25321510': {
    'prefecture': 'Shiga',
    'location': 'Rittou',
    'latitude': 35.01917,
    'longitude': 135.98222
},
'26101010': {
    'prefecture': 'Kyoto',
    'location': 'Kita',
    'latitude': 35.03722,
    'longitude': 135.74083
},
'26102510': {
    'prefecture': 'Kyoto',
    'location': 'Jihai_jyoukyou',
    'latitude': 35.03056,
    'longitude': 135.76222
},
'26103010': {
    'prefecture': 'Kyoto',
    'location': 'Sakyo',
    'latitude': 35.03528,
    'longitude': 135.78306
},
'26104010': {
    'prefecture': 'Kyoto',
    'location': 'Kyoto_shiyakusho',
    'latitude': 35.00861,
    'longitude': 135.77028
},
'26104060': {
    'prefecture': 'Kyoto',
    'location': 'Mibu',
    'latitude': 34.995,
    'longitude': 135.73694
},
'26104510': {
    'prefecture': 'Kyoto',
    'location': 'Jihai_Oomiya',
    'latitude': 35.00056,
    'longitude': 135.75139
},
'26104520': {
    'prefecture': 'Kyoto',
    'location': 'Jihai_nishinokyo',
    'latitude': 35.01917,
    'longitude': 135.73444
},
'26107510': {
    'prefecture': 'Kyoto',
    'location': 'jihai_minami',
    'latitude': 34.97361,
    'longitude': 135.74917
},
'26109010': {
    'prefecture': 'Kyoto',
    'location': 'Fushimi',
    'latitude': 34.93222,
    'longitude': 135.76417
},
'26109020': {
    'prefecture': 'Kyoto',
    'location': 'Kuga',
    'latitude': 34.935,
    'longitude': 135.735
},
'26109030': {
    'prefecture': 'Kyoto',
    'location': 'Daigo',
    'latitude': 34.94222,
    'longitude': 135.81
},
'26110010': {
    'prefecture': 'Kyoto',
    'location': 'Yamashina',
    'latitude': 34.98528,
    'longitude': 135.815
},
'26110510': {
    'prefecture': 'Kyoto',
    'location': 'Jihai_Yamashina',
    'latitude': 34.96917,
    'longitude': 135.81639
},
'26111010': {
    'prefecture': 'Kyoto',
    'location': 'Saikyou',
    'latitude': 34.96889,
    'longitude': 135.70056
},
'26201020': {
    'prefecture': 'Kyoto',
    'location': 'Osadano',
    'latitude': 35.2925,
    'longitude': 135.16556
},
'26201040': {
    'prefecture': 'Kyoto',
    'location': 'Fukuchiyama',
    'latitude': 35.29194,
    'longitude': 135.12833
},
'26201050': {
    'prefecture': 'Kyoto',
    'location': 'Mutobe',
    'latitude': 35.25361,
    'longitude': 135.17556
},
'26202010': {
    'prefecture': 'Kyoto',
    'location': 'Nishi-Maiduru',
    'latitude': 35.44194,
    'longitude': 135.34167
},
'26202030': {
    'prefecture': 'Kyoto',
    'location': 'Higashi-Maiduru',
    'latitude': 35.46944,
    'longitude': 135.40222
},
'26203010': {
    'prefecture': 'Kyoto',
    'location': 'Ayabe',
    'latitude': 35.29889,
    'longitude': 135.245
},
'26204010': {
    'prefecture': 'Kyoto',
    'location': 'Uji',
    'latitude': 34.88444,
    'longitude': 135.80056
},
'26205020': {
    'prefecture': 'Kyoto',
    'location': 'Miyadu',
    'latitude': 35.53,
    'longitude': 135.2025
},
'26206010': {
    'prefecture': 'Kyoto',
    'location': 'Kameoka',
    'latitude': 35.00972,
    'longitude': 135.56917
},
'26207030': {
    'prefecture': 'Kyoto',
    'location': 'Jyouyou',
    'latitude': 34.84944,
    'longitude': 135.79306
},
'26208020': {
    'prefecture': 'Kyoto',
    'location': 'Kouyou',
    'latitude': 34.94361,
    'longitude': 135.70694
},
'26209010': {
    'prefecture': 'Kyoto',
    'location': 'Nagaokakyou',
    'latitude': 34.92389,
    'longitude': 135.69806
},
'26210510': {
    'prefecture': 'Kyoto',
    'location': 'Kokudou1gou',
    'latitude': 34.85278,
    'longitude': 135.71861
},
'26212010': {
    'prefecture': 'Kyoto',
    'location': 'KYOTANGO',
    'latitude': 35.62583,
    'longitude': 135.07333
},
'26213010': {
    'prefecture': 'Kyoto',
    'location': 'ＮＡＮＴＡＮ',
    'latitude': 35.10861,
    'longitude': 135.455
},
'26303020': {
    'prefecture': 'Kyoto',
    'location': 'Ooyamazaki',
    'latitude': 34.90389,
    'longitude': 135.69472
},
'26303510': {
    'prefecture': 'Kyoto',
    'location': 'Kokudou171gou',
    'latitude': 34.88861,
    'longitude': 135.68639
},
'26322020': {
    'prefecture': 'Kyoto',
    'location': 'Kumiyama',
    'latitude': 34.88417,
    'longitude': 135.73972
},
'26342020': {
    'prefecture': 'Kyoto',
    'location': 'Tanabe',
    'latitude': 34.82083,
    'longitude': 135.77194
},
'26343010': {
    'prefecture': 'Kyoto',
    'location': 'ＩＤＥ',
    'latitude': 34.79694,
    'longitude': 135.8075
},
'26362020': {
    'prefecture': 'Kyoto',
    'location': 'Kidu',
    'latitude': 34.73611,
    'longitude': 135.83111
},
'26366030': {
    'prefecture': 'Kyoto',
    'location': 'SEIKA',
    'latitude': 34.74583,
    'longitude': 135.76556
},
'26367010': {
    'prefecture': 'Kyoto',
    'location': 'MINAMIYAMASHIRO',
    'latitude': 34.76528,
    'longitude': 136.02639
},
'27101010': {
    'prefecture': 'Osaka',
    'location': 'Kanbokusyougakkou',
    'latitude': 34.70861,
    'longitude': 135.51361
},
'27101510': {
    'prefecture': 'Osaka',
    'location': 'Umeda_shinmichi',
    'latitude': 34.69417,
    'longitude': 135.50417
},
'27103510': {
    'prefecture': 'Osaka',
    'location': 'Ebie_nishi_shougakkou',
    'latitude': 34.69417,
    'longitude': 135.47306
},
'27104010': {
    'prefecture': 'Osaka',
    'location': 'Konohana_kuyakusho',
    'latitude': 34.67944,
    'longitude': 135.455
},
'27106010': {
    'prefecture': 'Osaka',
    'location': 'Kujyouminamisyougakkou',
    'latitude': 34.67306,
    'longitude': 135.47306
},
'27108010': {
    'prefecture': 'Osaka',
    'location': 'Hirao_shougakkou',
    'latitude': 34.6375,
    'longitude': 135.47694
},
'27112010': {
    'prefecture': 'Osaka',
    'location': 'Osaka_Tower',
    'latitude': 34.69944,
    'longitude': 135.48917
},
'27113010': {
    'prefecture': 'Osaka',
    'location': 'Yodo_chuugakkou',
    'latitude': 34.70222,
    'longitude': 135.44361
},
'27113510': {
    'prefecture': 'Osaka',
    'location': 'Dekijimasyougakkou',
    'latitude': 34.70083,
    'longitude': 135.43972
},
'27114510': {
    'prefecture': 'Osaka',
    'location': 'Kamishinjou_kousaten',
    'latitude': 34.74528,
    'longitude': 135.53083
},
'27115010': {
    'prefecture': 'Osaka',
    'location': 'Kokusetsu_Osaka',
    'latitude': 34.67639,
    'longitude': 135.53806
},
'27115510': {
    'prefecture': 'Osaka',
    'location': 'Imazato_kousaten',
    'latitude': 34.66556,
    'longitude': 135.54556
},
'27116010': {
    'prefecture': 'Osaka',
    'location': 'Katsuyama-chuugakkou',
    'latitude': 34.65306,
    'longitude': 135.53694
},
'27117010': {
    'prefecture': 'Osaka',
    'location': 'Oomiya_chuugakkou',
    'latitude': 34.72389,
    'longitude': 135.54417
},
'27117510': {
    'prefecture': 'Osaka',
    'location': 'Shinmorisyoujisyougakkou',
    'latitude': 34.71194,
    'longitude': 135.56472
},
'27118020': {
    'prefecture': 'Osaka',
    'location': 'Seikensyougakkou',
    'latitude': 34.69417,
    'longitude': 135.54556
},
'27120510': {
    'prefecture': 'Osaka',
    'location': 'Abikotyuugakkou',
    'latitude': 34.60139,
    'longitude': 135.515
},
'27121510': {
    'prefecture': 'Osaka',
    'location': 'Kumatatyoukousaten',
    'latitude': 34.63333,
    'longitude': 135.54139
},
'27122010': {
    'prefecture': 'Osaka',
    'location': 'Imamiyatyuugakkou',
    'latitude': 34.64528,
    'longitude': 135.50139
},
'27123010': {
    'prefecture': 'Osaka',
    'location': 'Nonakasyougakkou',
    'latitude': 34.72806,
    'longitude': 135.48083
},
'27124010': {
    'prefecture': 'Osaka',
    'location': 'Matsuta_kita_shougakkou',
    'latitude': 34.70583,
    'longitude': 135.58861
},
'27124510': {
    'prefecture': 'Osaka',
    'location': 'Matsuta_chuugakkou',
    'latitude': 34.70028,
    'longitude': 135.58056
},
'27125010': {
    'prefecture': 'Osaka',
    'location': 'Kiyoe_shougakkou',
    'latitude': 34.60583,
    'longitude': 135.48222
},
'27125030': {
    'prefecture': 'Osaka',
    'location': 'Minamiminattyuuoukouen',
    'latitude': 34.6275,
    'longitude': 135.43556
},
'27125510': {
    'prefecture': 'Osaka',
    'location': 'Kitakohamasyougakkou',
    'latitude': 34.61944,
    'longitude': 135.49306
},
'27125520': {
    'prefecture': 'Osaka',
    'location': 'Suminoe_kousaten',
    'latitude': 34.60583,
    'longitude': 135.47583
},
'27126010': {
    'prefecture': 'Osaka',
    'location': 'Setuyotyugakkou',
    'latitude': 34.61667,
    'longitude': 135.54806
},
'27143510': {
    'prefecture': 'Osaka',
    'location': 'ｃｙｕｕｋａｎｉｓｉｈａｒａ',
    'latitude': 34.55861,
    'longitude': 135.53083
},
'27146010': {
    'prefecture': 'Osaka',
    'location': 'kanaokaminami',
    'latitude': 34.55528,
    'longitude': 135.51028
},
'27147010': {
    'prefecture': 'Osaka',
    'location': 'mihara',
    'latitude': 34.5375,
    'longitude': 135.56361
},
'27201020': {
    'prefecture': 'Osaka',
    'location': 'Shourinji',
    'latitude': 34.57111,
    'longitude': 135.47194
},
'27201030': {
    'prefecture': 'Osaka',
    'location': 'Hamadera',
    'latitude': 34.54083,
    'longitude': 135.46111
},
'27201050': {
    'prefecture': 'Osaka',
    'location': 'Ishidu',
    'latitude': 34.56,
    'longitude': 135.45583
},
'27201080': {
    'prefecture': 'Osaka',
    'location': 'Sanpou',
    'latitude': 34.59056,
    'longitude': 135.47528
},
'27201090': {
    'prefecture': 'Osaka',
    'location': 'Wakamatsudai',
    'latitude': 34.48333,
    'longitude': 135.515
},
'27201100': {
    'prefecture': 'Osaka',
    'location': 'Tomioka',
    'latitude': 34.52306,
    'longitude': 135.53167
},
'27201340': {
    'prefecture': 'Osaka',
    'location': 'Fukai',
    'latitude': 34.53611,
    'longitude': 135.50389
},
'27201510': {
    'prefecture': 'Osaka',
    'location': 'Sakai_shiyakusho',
    'latitude': 34.57083,
    'longitude': 135.48639
},
'27201560': {
    'prefecture': 'Osaka',
    'location': 'Wangan',
    'latitude': 34.555,
    'longitude': 135.45056
},
'27201570': {
    'prefecture': 'Osaka',
    'location': 'Tokiwahamadera',
    'latitude': 34.56556,
    'longitude': 135.51861
},
'27201580': {
    'prefecture': 'Osaka',
    'location': 'Hanwa_Fukaihatayama',
    'latitude': 34.525,
    'longitude': 135.51
},
'27201600': {
    'prefecture': 'Osaka',
    'location': 'Miahratanjyou',
    'latitude': 34.50306,
    'longitude': 135.56472
},
'27202060': {
    'prefecture': 'Osaka',
    'location': 'Kishiwadatyuuoukouen',
    'latitude': 34.46583,
    'longitude': 135.38194
},
'27202530': {
    'prefecture': 'Osaka',
    'location': 'Amanogawa_gesuiponpujou',
    'latitude': 34.48028,
    'longitude': 135.38389
},
'27203030': {
    'prefecture': 'Osaka',
    'location': 'toyonakashisennari',
    'latitude': 34.73417,
    'longitude': 135.47694
},
'27203510': {
    'prefecture': 'Osaka',
    'location': 'Toyonaka_shiyakusho',
    'latitude': 34.7775,
    'longitude': 135.4725
},
'27203520': {
    'prefecture': 'Osaka',
    'location': 'toyonakashisennri',
    'latitude': 34.80722,
    'longitude': 135.49056
},
'27204030': {
    'prefecture': 'Osaka',
    'location': 'Ikeda-shi_minamihatakaikan',
    'latitude': 34.82167,
    'longitude': 135.45028
},
'27205060': {
    'prefecture': 'Osaka',
    'location': 'suitashitarumi',
    'latitude': 34.75917,
    'longitude': 135.50361
},
'27205080': {
    'prefecture': 'Osaka',
    'location': 'suitashikitashyouboushyo',
    'latitude': 34.81167,
    'longitude': 135.51694
},
'27205090': {
    'prefecture': 'Osaka',
    'location': 'suitasitakanodai',
    'latitude': 34.79167,
    'longitude': 135.52083
},
'27205530': {
    'prefecture': 'Osaka',
    'location': 'suitakanisaibanshyo',
    'latitude': 34.75639,
    'longitude': 135.52139
},
'27206010': {
    'prefecture': 'Osaka',
    'location': 'Izumiootsu_humin_kenkou_puraza',
    'latitude': 34.50278,
    'longitude': 135.40861
},
'27206030': {
    'prefecture': 'Osaka',
    'location': 'Izumiootsushiyakusyo',
    'latitude': 34.50444,
    'longitude': 135.41056
},
'27207020': {
    'prefecture': 'Osaka',
    'location': 'takatsukikita',
    'latitude': 34.86306,
    'longitude': 135.59861
},
'27207030': {
    'prefecture': 'Osaka',
    'location': 'shoudokoro',
    'latitude': 34.83722,
    'longitude': 135.61444
},
'27207040': {
    'prefecture': 'Osaka',
    'location': 'ｋａｊｉｈａｒａ',
    'latitude': 34.86556,
    'longitude': 135.64944
},
'27207510': {
    'prefecture': 'Osaka',
    'location': 'Takatsuki_shiyakusho',
    'latitude': 34.84778,
    'longitude': 135.61278
},
'27208010': {
    'prefecture': 'Osaka',
    'location': 'Kaizukasyoubousyo',
    'latitude': 34.4325,
    'longitude': 135.36889
},
'27209010': {
    'prefecture': 'Osaka',
    'location': 'seibukomyunityisennta',
    'latitude': 34.72972,
    'longitude': 135.55694
},
'27209510': {
    'prefecture': 'Osaka',
    'location': 'Oosakafuritsuyodogawakoukakoutougakkou',
    'latitude': 34.73667,
    'longitude': 135.56278
},
'27210010': {
    'prefecture': 'Osaka',
    'location': 'Hirakata_shiyakusho',
    'latitude': 34.81111,
    'longitude': 135.65361
},
'27210020': {
    'prefecture': 'Osaka',
    'location': 'Wani_kouen',
    'latitude': 34.81806,
    'longitude': 135.70583
},
'27210030': {
    'prefecture': 'Osaka',
    'location': 'ｋｕｚｕｈａ',
    'latitude': 34.85972,
    'longitude': 135.68194
},
'27210510': {
    'prefecture': 'Osaka',
    'location': 'ｓｙｏｄａｉ',
    'latitude': 34.82972,
    'longitude': 135.6875
},
'27210520': {
    'prefecture': 'Osaka',
    'location': 'Nakaburi',
    'latitude': 34.79583,
    'longitude': 135.62667
},
'27211010': {
    'prefecture': 'Osaka',
    'location': 'ibarakishiyakusyo',
    'latitude': 34.81333,
    'longitude': 135.57139
},
'27212010': {
    'prefecture': 'Osaka',
    'location': 'yaoshihokensho',
    'latitude': 34.62222,
    'longitude': 135.605
},
'27212030': {
    'prefecture': 'Osaka',
    'location': 'mizukoshi',
    'latitude': 34.63528,
    'longitude': 135.63833
},
'27212510': {
    'prefecture': 'Osaka',
    'location': 'taishidou',
    'latitude': 34.61278,
    'longitude': 135.58889
},
'27212520': {
    'prefecture': 'Osaka',
    'location': 'kyuhoujiryokuti',
    'latitude': 34.62722,
    'longitude': 135.57806
},
'27213050': {
    'prefecture': 'Osaka',
    'location': 'Sanotyuugakkou',
    'latitude': 34.40056,
    'longitude': 135.30167
},
'27213510': {
    'prefecture': 'Osaka',
    'location': 'Suehirokouen',
    'latitude': 34.395,
    'longitude': 135.31222
},
'27214020': {
    'prefecture': 'Osaka',
    'location': 'Tondabayashishiyakusyo',
    'latitude': 34.49611,
    'longitude': 135.6
},
'27215010': {
    'prefecture': 'Osaka',
    'location': 'Neyagawashiyakusyo',
    'latitude': 34.76278,
    'longitude': 135.63083
},
'27216010': {
    'prefecture': 'Osaka',
    'location': 'Mikkaichikouminkan',
    'latitude': 34.43556,
    'longitude': 135.56778
},
'27216520': {
    'prefecture': 'Osaka',
    'location': 'ｓｏｔｏｋａｎｋａｗａｔｉｎａｇａｎｏ',
    'latitude': 34.45194,
    'longitude': 135.56639
},
'27217510': {
    'prefecture': 'Osaka',
    'location': 'Matsubara_kita_shougakkou',
    'latitude': 34.57556,
    'longitude': 135.55389
},
'27218010': {
    'prefecture': 'Osaka',
    'location': 'Daitou_shiyakusho',
    'latitude': 34.70861,
    'longitude': 135.62639
},
'27219040': {
    'prefecture': 'Osaka',
    'location': 'Midorigaoka_shougakkou',
    'latitude': 34.44222,
    'longitude': 135.46083
},
'27221010': {
    'prefecture': 'Osaka',
    'location': 'Furitsu_Shutoku_gakuin',
    'latitude': 34.56833,
    'longitude': 135.64472
},
'27224510': {
    'prefecture': 'Osaka',
    'location': 'Settsu_shiyakusho',
    'latitude': 34.77333,
    'longitude': 135.56417
},
'27225010': {
    'prefecture': 'Osaka',
    'location': 'Takaishityuugakkou',
    'latitude': 34.52222,
    'longitude': 135.44944
},
'27225510': {
    'prefecture': 'Osaka',
    'location': 'Kamodooru_MBS',
    'latitude': 34.51583,
    'longitude': 135.44667
},
'27226030': {
    'prefecture': 'Osaka',
    'location': 'Fujiiderashiyakusyo',
    'latitude': 34.57167,
    'longitude': 135.60028
},
'27227020': {
    'prefecture': 'Osaka',
    'location': 'higasioosakasirokumanji(kasetu)',
    'latitude': 34.655,
    'longitude': 135.63722
},
'27227030': {
    'prefecture': 'Osaka',
    'location': 'higashioosakashikankyoueiseikensasenta',
    'latitude': 34.66806,
    'longitude': 135.5975
},
'27227040': {
    'prefecture': 'Osaka',
    'location': 'Higashi-Osaka-shi_nishi_hokensenta',
    'latitude': 34.66167,
    'longitude': 135.57833
},
'27228010': {
    'prefecture': 'Osaka',
    'location': 'Sennan_shiyakusho',
    'latitude': 34.37111,
    'longitude': 135.28806
},
'27229510': {
    'prefecture': 'Osaka',
    'location': 'Kokusetsu_Shijonawate',
    'latitude': 34.73444,
    'longitude': 135.63472
},
'27301010': {
    'prefecture': 'Osaka',
    'location': 'Shimamototyouyakuba',
    'latitude': 34.88056,
    'longitude': 135.66583
},
'27321010': {
    'prefecture': 'Osaka',
    'location': 'Toyonochoyakuba',
    'latitude': 34.91889,
    'longitude': 135.49417
},
'27367010': {
    'prefecture': 'Osaka',
    'location': 'Nankaidannchi',
    'latitude': 34.33639,
    'longitude': 135.23083
},
'28101010': {
    'prefecture': 'Hyogo',
    'location': 'Higashinada',
    'latitude': 34.72083,
    'longitude': 135.26583
},
'28101020': {
    'prefecture': 'Hyogo',
    'location': 'Fukae',
    'latitude': 34.72194,
    'longitude': 135.29694
},
'28101030': {
    'prefecture': 'Hyogo',
    'location': 'Rokkou_airando',
    'latitude': 34.68472,
    'longitude': 135.26667
},
'28101040': {
    'prefecture': 'Hyogo',
    'location': 'sumiyoshiminami',
    'latitude': 34.70889,
    'longitude': 135.26278
},
'28101520': {
    'prefecture': 'Hyogo',
    'location': 'uozakijidousya',
    'latitude': 34.71389,
    'longitude': 135.27722
},
'28102010': {
    'prefecture': 'Hyogo',
    'location': 'Nada',
    'latitude': 34.71,
    'longitude': 135.23194
},
'28102040': {
    'prefecture': 'Hyogo',
    'location': 'nadahama',
    'latitude': 34.70528,
    'longitude': 135.23361
},
'28103010': {
    'prefecture': 'Hyogo',
    'location': 'Fukiai',
    'latitude': 34.70361,
    'longitude': 135.20583
},
'28105010': {
    'prefecture': 'Hyogo',
    'location': 'Hyougo_nanbu',
    'latitude': 34.65444,
    'longitude': 135.17222
},
'28106010': {
    'prefecture': 'Hyogo',
    'location': 'Nagata',
    'latitude': 34.66222,
    'longitude': 135.15389
},
'28107010': {
    'prefecture': 'Hyogo',
    'location': 'Suma',
    'latitude': 34.64278,
    'longitude': 135.12333
},
'28107020': {
    'prefecture': 'Hyogo',
    'location': 'Shirakawadai',
    'latitude': 34.68861,
    'longitude': 135.1025
},
'28107510': {
    'prefecture': 'Hyogo',
    'location': 'Seibu_jidousha',
    'latitude': 34.64694,
    'longitude': 135.13278
},
'28108010': {
    'prefecture': 'Hyogo',
    'location': 'Tarumi',
    'latitude': 34.63389,
    'longitude': 135.06389
},
'28108020': {
    'prefecture': 'Hyogo',
    'location': 'Seishin',
    'latitude': 34.70611,
    'longitude': 134.98639
},
'28108510': {
    'prefecture': 'Hyogo',
    'location': 'Tarumi_jidousha',
    'latitude': 34.62528,
    'longitude': 135.06333
},
'28109010': {
    'prefecture': 'Hyogo',
    'location': 'minamigoyou',
    'latitude': 34.72139,
    'longitude': 135.13444
},
'28109030': {
    'prefecture': 'Hyogo',
    'location': 'Hokushin',
    'latitude': 34.82167,
    'longitude': 135.22556
},
'28109520': {
    'prefecture': 'Hyogo',
    'location': 'Hokusinjidousha',
    'latitude': 34.85083,
    'longitude': 135.2175
},
'28110010': {
    'prefecture': 'Hyogo',
    'location': 'minatojima',
    'latitude': 34.6625,
    'longitude': 135.215
},
'28110510': {
    'prefecture': 'Hyogo',
    'location': 'chubujidosha',
    'latitude': 34.69556,
    'longitude': 135.20083
},
'28111010': {
    'prefecture': 'Hyogo',
    'location': 'Oshibedani',
    'latitude': 34.74,
    'longitude': 135.06806
},
'28111510': {
    'prefecture': 'Hyogo',
    'location': 'Nishijidousya',
    'latitude': 34.66972,
    'longitude': 134.98056
},
'28201020': {
    'prefecture': 'Hyogo',
    'location': 'Hirohata',
    'latitude': 34.80194,
    'longitude': 134.63139
},
'28201030': {
    'prefecture': 'Hyogo',
    'location': 'Shikama',
    'latitude': 34.79694,
    'longitude': 134.68
},
'28201040': {
    'prefecture': 'Hyogo',
    'location': 'Shirahama',
    'latitude': 34.78194,
    'longitude': 134.7075
},
'28201050': {
    'prefecture': 'Hyogo',
    'location': 'Mikunino',
    'latitude': 34.81583,
    'longitude': 134.74389
},
'28201060': {
    'prefecture': 'Hyogo',
    'location': 'Aboshi',
    'latitude': 34.78611,
    'longitude': 134.59139
},
'28201070': {
    'prefecture': 'Hyogo',
    'location': 'Shikisai',
    'latitude': 34.8575,
    'longitude': 134.64694
},
'28201080': {
    'prefecture': 'Hyogo',
    'location': 'Toyotomi',
    'latitude': 34.8775,
    'longitude': 134.74028
},
'28201090': {
    'prefecture': 'Hyogo',
    'location': 'Hayashida',
    'latitude': 34.90444,
    'longitude': 134.58083
},
'28201380': {
    'prefecture': 'Hyogo',
    'location': 'Yashiro',
    'latitude': 34.84333,
    'longitude': 134.7
},
'28201390': {
    'prefecture': 'Hyogo',
    'location': 'kodera',
    'latitude': 34.91056,
    'longitude': 134.73806
},
'28201520': {
    'prefecture': 'Hyogo',
    'location': 'senbajihai',
    'latitude': 34.83194,
    'longitude': 134.68556
},
'28201530': {
    'prefecture': 'Hyogo',
    'location': 'sikamajihai',
    'latitude': 34.79444,
    'longitude': 134.67278
},
'28202010': {
    'prefecture': 'Hyogo',
    'location': 'Ichiritsu_Tachibana_kita_shougakkou',
    'latitude': 34.74417,
    'longitude': 135.40806
},
'28202020': {
    'prefecture': 'Hyogo',
    'location': 'Kokusetsu__Amagasaki',
    'latitude': 34.72278,
    'longitude': 135.41778
},
'28202030': {
    'prefecture': 'Hyogo',
    'location': 'Jounai_koukou',
    'latitude': 34.71278,
    'longitude': 135.42278
},
'28202040': {
    'prefecture': 'Hyogo',
    'location': 'Oda_minami_chuugakkou',
    'latitude': 34.72667,
    'longitude': 135.43667
},
'28202050': {
    'prefecture': 'Hyogo',
    'location': 'Ooshou_kouminkan',
    'latitude': 34.71861,
    'longitude': 135.39333
},
'28202100': {
    'prefecture': 'Hyogo',
    'location': 'Amagasaki_higashi_koukou',
    'latitude': 34.75556,
    'longitude': 135.44306
},
'28202520': {
    'prefecture': 'Hyogo',
    'location': 'Mukogawa',
    'latitude': 34.71194,
    'longitude': 135.39111
},
'28202530': {
    'prefecture': 'Hyogo',
    'location': 'Muko_kougyoukoukou',
    'latitude': 34.76111,
    'longitude': 135.38833
},
'28202540': {
    'prefecture': 'Hyogo',
    'location': 'Sunada_Kodomohiroba',
    'latitude': 34.74194,
    'longitude': 135.41444
},
'28202550': {
    'prefecture': 'Hyogo',
    'location': 'Kamisakabe_nishi_kouen',
    'latitude': 34.74528,
    'longitude': 135.42528
},
'28202560': {
    'prefecture': 'Hyogo',
    'location': 'Hamada',
    'latitude': 34.72389,
    'longitude': 135.39833
},
'28202570': {
    'prefecture': 'Hyogo',
    'location': 'Sonowa_shougakkou',
    'latitude': 34.75056,
    'longitude': 135.44889
},
'28202580': {
    'prefecture': 'Hyogo',
    'location': 'Kokusetsuamagasakijidousyakoutsuukannkyousokuteijyo',
    'latitude': 34.70944,
    'longitude': 135.42639
},
'28203020': {
    'prefecture': 'Hyogo',
    'location': 'Futami',
    'latitude': 34.69472,
    'longitude': 134.89
},
'28203030': {
    'prefecture': 'Hyogo',
    'location': 'Ookubo',
    'latitude': 34.67611,
    'longitude': 134.94139
},
'28203060': {
    'prefecture': 'Hyogo',
    'location': 'Ouji',
    'latitude': 34.65,
    'longitude': 134.98333
},
'28203510': {
    'prefecture': 'Hyogo',
    'location': 'Hayashizaki',
    'latitude': 34.64583,
    'longitude': 134.97278
},
'28203530': {
    'prefecture': 'Hyogo',
    'location': 'Kokubo',
    'latitude': 34.66472,
    'longitude': 134.96444
},
'28204010': {
    'prefecture': 'Hyogo',
    'location': 'Nishinomiya_shiyakusho',
    'latitude': 34.73389,
    'longitude': 135.34389
},
'28204020': {
    'prefecture': 'Hyogo',
    'location': 'Naruo_shisho',
    'latitude': 34.71528,
    'longitude': 135.37306
},
'28204030': {
    'prefecture': 'Hyogo',
    'location': 'Kawaragi_kouminkan',
    'latitude': 34.74028,
    'longitude': 135.37028
},
'28204130': {
    'prefecture': 'Hyogo',
    'location': 'Kouryou_chuugakkou',
    'latitude': 34.765,
    'longitude': 135.355
},
'28204140': {
    'prefecture': 'Hyogo',
    'location': 'Yamaguchi_shougakkou',
    'latitude': 34.82361,
    'longitude': 135.23917
},
'28204150': {
    'prefecture': 'Hyogo',
    'location': 'Hama_koushien',
    'latitude': 34.71,
    'longitude': 135.35667
},
'28204510': {
    'prefecture': 'Hyogo',
    'location': 'Rokutanji',
    'latitude': 34.735,
    'longitude': 135.34417
},
'28204520': {
    'prefecture': 'Hyogo',
    'location': 'Tsumongawa',
    'latitude': 34.72806,
    'longitude': 135.35139
},
'28204530': {
    'prefecture': 'Hyogo',
    'location': 'Kawahara',
    'latitude': 34.74472,
    'longitude': 135.34833
},
'28204560': {
    'prefecture': 'Hyogo',
    'location': 'Koushien',
    'latitude': 34.71722,
    'longitude': 135.36972
},
'28204570': {
    'prefecture': 'Hyogo',
    'location': 'Shiose',
    'latitude': 34.82306,
    'longitude': 135.30972
},
'28205010': {
    'prefecture': 'Hyogo',
    'location': 'Sumoto_shiyakusho',
    'latitude': 34.33972,
    'longitude': 134.89778
},
'28206090': {
    'prefecture': 'Hyogo',
    'location': 'Asahigaoka_shougakkou',
    'latitude': 34.74222,
    'longitude': 135.30694
},
'28206510': {
    'prefecture': 'Hyogo',
    'location': 'Uchide',
    'latitude': 34.72778,
    'longitude': 135.32
},
'28207030': {
    'prefecture': 'Hyogo',
    'location': 'Itami_shiyakusho',
    'latitude': 34.78083,
    'longitude': 135.40361
},
'28207510': {
    'prefecture': 'Hyogo',
    'location': 'Midorigaoka',
    'latitude': 34.79028,
    'longitude': 135.41333
},
'28208010': {
    'prefecture': 'Hyogo',
    'location': 'Aioi_shiyakusho',
    'latitude': 34.8,
    'longitude': 134.47111
},
'28208510': {
    'prefecture': 'Hyogo',
    'location': 'Ikenouchi',
    'latitude': 34.81583,
    'longitude': 134.48806
},
'28209010': {
    'prefecture': 'Hyogo',
    'location': 'Toyokokashiyakusyo',
    'latitude': 35.54139,
    'longitude': 134.82361
},
'28209510': {
    'prefecture': 'Hyogo',
    'location': 'Koozaki',
    'latitude': 35.53556,
    'longitude': 134.82722
},
'28210010': {
    'prefecture': 'Hyogo',
    'location': 'Kakogawa_shiyakusho',
    'latitude': 34.75444,
    'longitude': 134.845
},
'28210020': {
    'prefecture': 'Hyogo',
    'location': 'onoe',
    'latitude': 34.73861,
    'longitude': 134.82694
},
'28210030': {
    'prefecture': 'Hyogo',
    'location': 'Beppu',
    'latitude': 34.72389,
    'longitude': 134.84611
},
'28210050': {
    'prefecture': 'Hyogo',
    'location': 'higashikanki',
    'latitude': 34.78972,
    'longitude': 134.83528
},
'28210180': {
    'prefecture': 'Hyogo',
    'location': 'Shikatakouminkan',
    'latitude': 34.81806,
    'longitude': 134.82222
},
'28210190': {
    'prefecture': 'Hyogo',
    'location': 'heisou',
    'latitude': 34.80333,
    'longitude': 134.875
},
'28210520': {
    'prefecture': 'Hyogo',
    'location': 'Hiraoka',
    'latitude': 34.73917,
    'longitude': 134.87917
},
'28210530': {
    'prefecture': 'Hyogo',
    'location': 'Kyuuri',
    'latitude': 34.75694,
    'longitude': 134.82278
},
'28211010': {
    'prefecture': 'Hyogo',
    'location': 'Tatsuno_shiyakusho',
    'latitude': 34.85528,
    'longitude': 134.56
},
'28212010': {
    'prefecture': 'Hyogo',
    'location': 'Akou_shiyakusho',
    'latitude': 34.75167,
    'longitude': 134.39306
},
'28213010': {
    'prefecture': 'Hyogo',
    'location': 'Nishiwaki_shiyakusho',
    'latitude': 34.99,
    'longitude': 134.97194
},
'28214010': {
    'prefecture': 'Hyogo',
    'location': 'Takatsukasa_chuugakkou',
    'latitude': 34.78611,
    'longitude': 135.36194
},
'28214510': {
    'prefecture': 'Hyogo',
    'location': 'Sakaemachi',
    'latitude': 34.80611,
    'longitude': 135.3475
},
'28216010': {
    'prefecture': 'Hyogo',
    'location': 'Takasagoshiyakusyo',
    'latitude': 34.7625,
    'longitude': 134.79306
},
'28216520': {
    'prefecture': 'Hyogo',
    'location': 'Nakashima',
    'latitude': 34.76972,
    'longitude': 134.80083
},
'28217010': {
    'prefecture': 'Hyogo',
    'location': 'Kawanishi_shiyakusho',
    'latitude': 34.82722,
    'longitude': 135.41917
},
'28217520': {
    'prefecture': 'Hyogo',
    'location': 'Kamo',
    'latitude': 34.80861,
    'longitude': 135.41361
},
'28217530': {
    'prefecture': 'Hyogo',
    'location': 'kawanishishimonjubashijihai',
    'latitude': 34.88389,
    'longitude': 135.40222
},
'28218510': {
    'prefecture': 'Hyogo',
    'location': 'Kamihonmachi',
    'latitude': 34.845,
    'longitude': 134.93806
},
'28219010': {
    'prefecture': 'Hyogo',
    'location': 'Sanda_shiyakusho',
    'latitude': 34.88583,
    'longitude': 135.22806
},
'28381010': {
    'prefecture': 'Hyogo',
    'location': 'Inami-chou_yakuba',
    'latitude': 34.74556,
    'longitude': 134.905
},
'28382010': {
    'prefecture': 'Hyogo',
    'location': 'Harima-chou_yakuba',
    'latitude': 34.7125,
    'longitude': 134.87056
},
'28464010': {
    'prefecture': 'Hyogo',
    'location': 'Taishi-chou_yakuba',
    'latitude': 34.83333,
    'longitude': 134.57806
},
'28641010': {
    'prefecture': 'Hyogo',
    'location': 'Kaibara',
    'latitude': 35.12611,
    'longitude': 135.08528
},
'29201010': {
    'prefecture': 'Nara',
    'location': 'Nara',
    'latitude': 34.67278,
    'longitude': 135.82139
},
'29201020': {
    'prefecture': 'Nara',
    'location': 'Seibu',
    'latitude': 34.7,
    'longitude': 135.74389
},
'29201030': {
    'prefecture': 'Nara',
    'location': 'suzaku',
    'latitude': 34.71222,
    'longitude': 135.80139
},
'29201060': {
    'prefecture': 'Nara',
    'location': 'Asuka',
    'latitude': 34.67194,
    'longitude': 135.83778
},
'29201510': {
    'prefecture': 'Nara',
    'location': 'Jihai_Nara',
    'latitude': 34.68083,
    'longitude': 135.81361
},
'29201520': {
    'prefecture': 'Nara',
    'location': 'Jihai_Seibu',
    'latitude': 34.66556,
    'longitude': 135.75028
},
'29201530': {
    'prefecture': 'Nara',
    'location': 'jihaikasiwagikyoku',
    'latitude': 34.67222,
    'longitude': 135.80028
},
'29202010': {
    'prefecture': 'Nara',
    'location': 'Takada',
    'latitude': 34.51083,
    'longitude': 135.73917
},
'29204010': {
    'prefecture': 'Nara',
    'location': 'Tenri',
    'latitude': 34.59139,
    'longitude': 135.83167
},
'29205510': {
    'prefecture': 'Nara',
    'location': 'Jihai_Kashihara',
    'latitude': 34.50806,
    'longitude': 135.79722
},
'29206010': {
    'prefecture': 'Nara',
    'location': 'Sakurai',
    'latitude': 34.51806,
    'longitude': 135.84472
},
'29208010': {
    'prefecture': 'Nara',
    'location': 'Gose',
    'latitude': 34.45722,
    'longitude': 135.73972
},
'29209010': {
    'prefecture': 'Nara',
    'location': 'Ikoma',
    'latitude': 34.68861,
    'longitude': 135.70972
},
'29209510': {
    'prefecture': 'Nara',
    'location': 'Jihai_Ikoma',
    'latitude': 34.67056,
    'longitude': 135.70361
},
'29363010': {
    'prefecture': 'Nara',
    'location': 'Tawaramoto',
    'latitude': 34.55528,
    'longitude': 135.79194
},
'29425010': {
    'prefecture': 'Nara',
    'location': 'Ouji',
    'latitude': 34.59111,
    'longitude': 135.71028
},
'29451010': {
    'prefecture': 'Nara',
    'location': 'odai',
    'latitude': 34.19778,
    'longitude': 136.06389
},
'30201020': {
    'prefecture': 'Wakayama',
    'location': 'Nishihokensenta-',
    'latitude': 34.24444,
    'longitude': 135.14056
},
'30201030': {
    'prefecture': 'Wakayama',
    'location': 'Shimabashichikukaikan',
    'latitude': 34.24167,
    'longitude': 135.14944
},
'30201040': {
    'prefecture': 'Wakayama',
    'location': 'Nakanoshimasyougakkou',
    'latitude': 34.23972,
    'longitude': 135.18583
},
'30201050': {
    'prefecture': 'Wakayama',
    'location': 'Kaneiken',
    'latitude': 34.21083,
    'longitude': 135.16556
},
'30201070': {
    'prefecture': 'Wakayama',
    'location': 'KINOMOTO SHATAKU',
    'latitude': 34.25056,
    'longitude': 135.1325
},
'30201080': {
    'prefecture': 'Wakayama',
    'location': 'MINATO SHOGAKKO',
    'latitude': 34.23278,
    'longitude': 135.14528
},
'30201110': {
    'prefecture': 'Wakayama',
    'location': 'Meiwatyugakkou',
    'latitude': 34.18556,
    'longitude': 135.18028
},
'30201130': {
    'prefecture': 'Wakayama',
    'location': 'Kokurasyougakkou',
    'latitude': 34.23944,
    'longitude': 135.29
},
'30201250': {
    'prefecture': 'Wakayama',
    'location': 'ＳＥＩＭＥＩＲＹＯ',
    'latitude': 34.25444,
    'longitude': 135.10944
},
'30201270': {
    'prefecture': 'Wakayama',
    'location': 'Shirituwakayamakoukou',
    'latitude': 34.25639,
    'longitude': 135.20139
},
'30201280': {
    'prefecture': 'Wakayama',
    'location': 'Minami_shoubou_Miyamae_shucchoujo',
    'latitude': 34.21056,
    'longitude': 135.18361
},
'30201300': {
    'prefecture': 'Wakayama',
    'location': 'MIYAMAESYOGAKKO',
    'latitude': 34.21278,
    'longitude': 135.18639
},
'30201520': {
    'prefecture': 'Wakayama',
    'location': 'Shinnan_shougakkou',
    'latitude': 34.22306,
    'longitude': 135.1925
},
'30202010': {
    'prefecture': 'Wakayama',
    'location': 'Kainan_shiyakusho',
    'latitude': 34.15222,
    'longitude': 135.21194
},
'30202020': {
    'prefecture': 'Wakayama',
    'location': 'Utsumi_shougakkou',
    'latitude': 34.15,
    'longitude': 135.21417
},
'30202060': {
    'prefecture': 'Wakayama',
    'location': 'Kitanokami_shougakkou',
    'latitude': 34.18028,
    'longitude': 135.29556
},
'30202070': {
    'prefecture': 'Wakayama',
    'location': 'Kamegawa_chuugakkou',
    'latitude': 34.16722,
    'longitude': 135.24111
},
'30202080': {
    'prefecture': 'Wakayama',
    'location': 'Utsmi_shou_Shimizu_bunkou',
    'latitude': 34.13944,
    'longitude': 135.19111
},
'30202090': {
    'prefecture': 'Wakayama',
    'location': 'Nakanokami_shougakkou',
    'latitude': 34.15667,
    'longitude': 135.28778
},
'30202100': {
    'prefecture': 'Wakayama',
    'location': 'Minaminokami_shougakkou',
    'latitude': 34.14472,
    'longitude': 135.27389
},
'30202120': {
    'prefecture': 'Wakayama',
    'location': 'Higashi-Kainan_chuugakkou',
    'latitude': 34.15139,
    'longitude': 135.3175
},
'30202140': {
    'prefecture': 'Wakayama',
    'location': 'hikatasyogakkou',
    'latitude': 34.15611,
    'longitude': 135.21028
},
'30202150': {
    'prefecture': 'Wakayama',
    'location': 'Utsumi_shougakkou',
    'latitude': 34.14667,
    'longitude': 135.21694
},
'30202160': {
    'prefecture': 'Wakayama',
    'location': 'Kuroe_shougakkou',
    'latitude': 34.15611,
    'longitude': 135.20306
},
'30202180': {
    'prefecture': 'Wakayama',
    'location': 'Shoubouhigashishucchousho',
    'latitude': 34.16222,
    'longitude': 135.27944
},
'30203010': {
    'prefecture': 'Wakayama',
    'location': 'ITOSOGOCHOSHA',
    'latitude': 34.31167,
    'longitude': 135.60111
},
'30204030': {
    'prefecture': 'Wakayama',
    'location': 'ARIDA-SHI HATSUSHIMA KOUMINKAN',
    'latitude': 34.1,
    'longitude': 135.11611
},
'30205010': {
    'prefecture': 'Wakayama',
    'location': 'Gobou_kanshishisho',
    'latitude': 33.88917,
    'longitude': 135.15778
},
'30205020': {
    'prefecture': 'Wakayama',
    'location': 'Yukawakyoku',
    'latitude': 33.90417,
    'longitude': 135.16639
},
'30205030': {
    'prefecture': 'Wakayama',
    'location': 'Fujitakyoku',
    'latitude': 33.90028,
    'longitude': 135.17056
},
'30205040': {
    'prefecture': 'Wakayama',
    'location': 'Noguchikyoku',
    'latitude': 33.89194,
    'longitude': 135.18306
},
'30205050': {
    'prefecture': 'Wakayama',
    'location': 'Shioyakyoku',
    'latitude': 33.86472,
    'longitude': 135.16528
},
'30205060': {
    'prefecture': 'Wakayama',
    'location': 'Nadakyoku',
    'latitude': 33.83083,
    'longitude': 135.18556
},
'30206010': {
    'prefecture': 'Wakayama',
    'location': 'Aidu_kouen',
    'latitude': 33.73167,
    'longitude': 135.38
},
'30207010': {
    'prefecture': 'Wakayama',
    'location': 'SHINGUKOKO',
    'latitude': 33.72083,
    'longitude': 135.98472
},
'30301020': {
    'prefecture': 'Wakayama',
    'location': 'Shimotsu_kouwankaikan',
    'latitude': 34.1075,
    'longitude': 135.14694
},
'30301030': {
    'prefecture': 'Wakayama',
    'location': 'Kainanshishimotsugyouseikyoku',
    'latitude': 34.12611,
    'longitude': 135.15861
},
'30301050': {
    'prefecture': 'Wakayama',
    'location': 'KAMO DAIICHI SHOGAKKO',
    'latitude': 34.12417,
    'longitude': 135.18611
},
'30302010': {
    'prefecture': 'Wakayama',
    'location': 'Nokami_shougakkou',
    'latitude': 34.16028,
    'longitude': 135.31
},
'30322010': {
    'prefecture': 'Wakayama',
    'location': 'kokawachubuundojyo',
    'latitude': 34.2725,
    'longitude': 135.40222
},
'30361010': {
    'prefecture': 'Wakayama',
    'location': 'Taikyuu_koukou',
    'latitude': 34.03306,
    'longitude': 135.18611
},
'30384010': {
    'prefecture': 'Wakayama',
    'location': 'Kogumahiroba',
    'latitude': 33.90472,
    'longitude': 135.19861
},
'30390010': {
    'prefecture': 'Wakayama',
    'location': 'Inanbara',
    'latitude': 33.8725,
    'longitude': 135.23861
},
'30391010': {
    'prefecture': 'Wakayama',
    'location': 'MINABE-CHO OSHINE GURAUNDO',
    'latitude': 33.78528,
    'longitude': 135.33972
},
'31201020': {
    'prefecture': 'Tottori',
    'location': 'Sakaemachikousaten',
    'latitude': 35.49278,
    'longitude': 134.23056
},
'31201040': {
    'prefecture': 'Tottori',
    'location': 'tottorikencyounishimachibuncyousya',
    'latitude': 35.50361,
    'longitude': 134.23611
},
'31202020': {
    'prefecture': 'Tottori',
    'location': 'Yonegohokenjyo',
    'latitude': 35.43472,
    'longitude': 133.34417
},
'31202520': {
    'prefecture': 'Totori',
    'location': 'yonagoshiyakusyomaekyoku',
    'latitude': 35.425,
    'longitude': 133.33333
},
'31203020': {
    'prefecture': 'Tottori',
    'location': 'Kurayoshihokenjyo',
    'latitude': 35.43861,
    'longitude': 133.9275
},
'31204010': {
    'prefecture': 'Tottori',
    'location': 'sakaiminatoshiseidouchou',
    'latitude': 35.51417,
    'longitude': 133.23556
},
'32201060': {
    'prefecture': 'Shimane',
    'location': 'Kokusetsu_Matsue',
    'latitude': 35.47222,
    'longitude': 133.015
},
'32201520': {
    'prefecture': 'Shimane',
    'location': 'Nishi-Tsuda_jihai',
    'latitude': 35.45583,
    'longitude': 133.06889
},
'32202040': {
    'prefecture': 'Shimane',
    'location': 'Hamada_Gouchou',
    'latitude': 34.89444,
    'longitude': 132.07389
},
'32203040': {
    'prefecture': 'Shimane',
    'location': 'Izumohokenjyo',
    'latitude': 35.36111,
    'longitude': 132.75278
},
'32204040': {
    'prefecture': 'Shimane',
    'location': 'Masuda_gouchou',
    'latitude': 34.67528,
    'longitude': 131.85389
},
'32204950': {
    'prefecture': 'Shimane',
    'location': 'Kokusetsu_Banryu_Lake',
    'latitude': 34.68167,
    'longitude': 131.79972
},
'32205010': {
    'prefecture': 'Shimane',
    'location': 'Ootaippankannkyoutaikisokuteikyoku',
    'latitude': 35.20139,
    'longitude': 132.50417
},
'32206040': {
    'prefecture': 'Shimane',
    'location': 'Yasukiippannkannkyoutaikisokuteikyoku',
    'latitude': 35.41528,
    'longitude': 133.24472
},
'32207060': {
    'prefecture': 'Shimane',
    'location': 'Ezushiyakusyoippankankyoutaikisokuteikyoku',
    'latitude': 35.00833,
    'longitude': 132.225
},
'32209010': {
    'prefecture': 'Shimane',
    'location': 'UNNANGOUTYOU',
    'latitude': 35.30889,
    'longitude': 132.90056
},
'32528950': {
    'prefecture': 'Shimane',
    'location': 'Kokusetsu_Oki',
    'latitude': 36.28861,
    'longitude': 133.185
},
'33201040': {
    'prefecture': 'Okayama',
    'location': 'Enami',
    'latitude': 34.60028,
    'longitude': 133.97583
},
'33201060': {
    'prefecture': 'Okayama',
    'location': 'Nanki',
    'latitude': 34.60278,
    'longitude': 133.9375
},
'33201120': {
    'prefecture': 'Okayama',
    'location': 'Saidaiji',
    'latitude': 34.65389,
    'longitude': 134.03611
},
'33201130': {
    'prefecture': 'Okayama',
    'location': 'Minamigata',
    'latitude': 34.66806,
    'longitude': 133.92611
},
'33201160': {
    'prefecture': 'Okayama',
    'location': 'Higashiokayama',
    'latitude': 34.68111,
    'longitude': 133.98833
},
'33201170': {
    'prefecture': 'Okayama',
    'location': 'Jounan',
    'latitude': 34.63083,
    'longitude': 134.00583
},
'33201180': {
    'prefecture': 'Okayama',
    'location': 'Izushi',
    'latitude': 34.65778,
    'longitude': 133.92389
},
'33201190': {
    'prefecture': 'Okayama',
    'location': 'Koujo',
    'latitude': 34.58583,
    'longitude': 133.855
},
'33201200': {
    'prefecture': 'Okayama',
    'location': 'Sannan',
    'latitude': 34.6125,
    'longitude': 134.07278
},
'33201210': {
    'prefecture': 'Okayama',
    'location': 'Kibi',
    'latitude': 34.64889,
    'longitude': 133.86583
},
'33201220': {
    'prefecture': 'Okayama',
    'location': 'GOMYOU',
    'latitude': 34.63972,
    'longitude': 134.05278
},
'33201510': {
    'prefecture': 'Okayama',
    'location': 'Seiki',
    'latitude': 34.6475,
    'longitude': 133.92833
},
'33201520': {
    'prefecture': 'Okayama',
    'location': 'Niwase',
    'latitude': 34.64306,
    'longitude': 133.85028
},
'33201530': {
    'prefecture': 'Okayama',
    'location': 'Aoe',
    'latitude': 34.62556,
    'longitude': 133.92194
},
'33201540': {
    'prefecture': 'Okayama',
    'location': 'SEISO',
    'latitude': 34.70972,
    'longitude': 134.08111
},
'33202020': {
    'prefecture': 'Okayama',
    'location': 'Kasuga',
    'latitude': 34.54222,
    'longitude': 133.74583
},
'33202030': {
    'prefecture': 'Okayama',
    'location': 'Hiroe',
    'latitude': 34.5175,
    'longitude': 133.7775
},
'33202060': {
    'prefecture': 'Okayama',
    'location': 'Matsue',
    'latitude': 34.50833,
    'longitude': 133.76194
},
'33202070': {
    'prefecture': 'Okayama',
    'location': 'Yobimatsu',
    'latitude': 34.50583,
    'longitude': 133.77194
},
'33202080': {
    'prefecture': 'Okayama',
    'location': 'Unotsu',
    'latitude': 34.49806,
    'longitude': 133.78
},
'33202090': {
    'prefecture': 'Okayama',
    'location': 'Shionasu',
    'latitude': 34.47361,
    'longitude': 133.77333
},
'33202100': {
    'prefecture': 'Okayama',
    'location': 'Tsurajima',
    'latitude': 34.53778,
    'longitude': 133.71694
},
'33202110': {
    'prefecture': 'Okayama',
    'location': 'Kokusetsu_Kurashiki',
    'latitude': 34.59694,
    'longitude': 133.78056
},
'33202120': {
    'prefecture': 'Okayama',
    'location': 'Toyosu',
    'latitude': 34.59028,
    'longitude': 133.81
},
'33202130': {
    'prefecture': 'Okayama',
    'location': 'Amaki',
    'latitude': 34.55694,
    'longitude': 133.815
},
'33202140': {
    'prefecture': 'Okayama',
    'location': 'Chayamachi',
    'latitude': 34.58056,
    'longitude': 133.83972
},
'33202150': {
    'prefecture': 'Okayama',
    'location': 'Gounai',
    'latitude': 34.53278,
    'longitude': 133.81861
},
'33202160': {
    'prefecture': 'Okayama',
    'location': 'Nishiachi',
    'latitude': 34.58056,
    'longitude': 133.73056
},
'33202170': {
    'prefecture': 'Okayama',
    'location': 'Tamashima',
    'latitude': 34.54444,
    'longitude': 133.67111
},
'33202180': {
    'prefecture': 'Okayama',
    'location': 'Kojima',
    'latitude': 34.46611,
    'longitude': 133.81222
},
'33202190': {
    'prefecture': 'Okayama',
    'location': 'Tanokuchi',
    'latitude': 34.47,
    'longitude': 133.8475
},
'33202400': {
    'prefecture': 'Okayama',
    'location': 'ｋａｎｓｈｉｓｅｎｔａ',
    'latitude': 34.52778,
    'longitude': 133.73972
},
'33202410': {
    'prefecture': 'Okayama',
    'location': 'fukuda',
    'latitude': 34.53556,
    'longitude': 133.76194
},
'33202420': {
    'prefecture': 'Okayama',
    'location': 'sho',
    'latitude': 34.6475,
    'longitude': 133.82306
},
'33202520': {
    'prefecture': 'Okayama',
    'location': 'Ekimae',
    'latitude': 34.59722,
    'longitude': 133.76861
},
'33202530': {
    'prefecture': 'Okayama',
    'location': 'Ootaka',
    'latitude': 34.57583,
    'longitude': 133.75889
},
'33203020': {
    'prefecture': 'Okayama',
    'location': 'Tsuyama',
    'latitude': 35.06833,
    'longitude': 134.01139
},
'33204010': {
    'prefecture': 'Okayama',
    'location': 'Hibi',
    'latitude': 34.45583,
    'longitude': 133.92583
},
'33204020': {
    'prefecture': 'Okayama',
    'location': 'Mukaihibi1choume',
    'latitude': 34.45667,
    'longitude': 133.93444
},
'33204030': {
    'prefecture': 'Okayama',
    'location': 'Shibukawa',
    'latitude': 34.45389,
    'longitude': 133.90917
},
'33204040': {
    'prefecture': 'Okayama',
    'location': 'Uno',
    'latitude': 34.4875,
    'longitude': 133.94917
},
'33204050': {
    'prefecture': 'Okayama',
    'location': 'Hibi2tyoume',
    'latitude': 34.45278,
    'longitude': 133.92333
},
'33204060': {
    'prefecture': 'Okayama',
    'location': 'Mukaihibi2tyoume',
    'latitude': 34.45222,
    'longitude': 133.93278
},
'33204070': {
    'prefecture': 'Okayama',
    'location': 'Gokan',
    'latitude': 34.53111,
    'longitude': 133.97944
},
'33204090': {
    'prefecture': 'Okayama',
    'location': 'Mochiyoshi',
    'latitude': 34.52167,
    'longitude': 133.90139
},
'33204510': {
    'prefecture': 'Okayama',
    'location': 'Tama',
    'latitude': 34.47889,
    'longitude': 133.93278
},
'33205010': {
    'prefecture': 'Okayama',
    'location': 'Terama',
    'latitude': 34.45583,
    'longitude': 133.49333
},
'33205020': {
    'prefecture': 'Okayama',
    'location': 'Mobira',
    'latitude': 34.49056,
    'longitude': 133.46333
},
'33205030': {
    'prefecture': 'Okayama',
    'location': 'Kasaoka',
    'latitude': 34.50389,
    'longitude': 133.50944
},
'33205510': {
    'prefecture': 'Okayama',
    'location': 'Ooiso',
    'latitude': 34.49583,
    'longitude': 133.51861
},
'33207510': {
    'prefecture': 'Okayama',
    'location': 'Ihara',
    'latitude': 34.59944,
    'longitude': 133.46472
},
'33208010': {
    'prefecture': 'Okayama',
    'location': 'Soujya',
    'latitude': 34.67056,
    'longitude': 133.74694
},
'33209010': {
    'prefecture': 'Okayama',
    'location': 'Takahashi',
    'latitude': 34.79139,
    'longitude': 133.61083
},
'33210010': {
    'prefecture': 'Okayama',
    'location': 'Niimi',
    'latitude': 34.97028,
    'longitude': 133.47083
},
'33211030': {
    'prefecture': 'Okayama',
    'location': 'Honami',
    'latitude': 34.72806,
    'longitude': 134.22111
},
'33211040': {
    'prefecture': 'Okayama',
    'location': 'Tsurumi',
    'latitude': 34.7025,
    'longitude': 134.19556
},
'33211050': {
    'prefecture': 'Okayama',
    'location': 'Higashikatakami',
    'latitude': 34.74167,
    'longitude': 134.1975
},
'33211060': {
    'prefecture': 'Okayama',
    'location': 'Mitsuishi',
    'latitude': 34.8,
    'longitude': 134.27528
},
'33211070': {
    'prefecture': 'Okayama',
    'location': 'Nodani',
    'latitude': 34.80111,
    'longitude': 134.26167
},
'33211520': {
    'prefecture': 'Okayama',
    'location': 'Inbe',
    'latitude': 34.73667,
    'longitude': 134.16639
},
'33213020': {
    'prefecture': 'Okayama',
    'location': 'Kumayama',
    'latitude': 34.77778,
    'longitude': 134.09861
},
'33215010': {
    'prefecture': 'Okayama',
    'location': 'Mimasaka',
    'latitude': 35.03222,
    'longitude': 134.15556
},
'33342010': {
    'prefecture': 'Okayama',
    'location': 'Hinase',
    'latitude': 34.74389,
    'longitude': 134.29667
},
'33401010': {
    'prefecture': 'Okayama',
    'location': 'FUNAHO',
    'latitude': 34.53833,
    'longitude': 133.86639
},
'33423010': {
    'prefecture': 'Okayama',
    'location': 'Hayashima',
    'latitude': 34.595,
    'longitude': 133.82778
},
'33423510': {
    'prefecture': 'Okayama',
    'location': 'Nagatsu',
    'latitude': 34.60111,
    'longitude': 133.82111
},
'33441010': {
    'prefecture': 'Okayama',
    'location': 'Funao',
    'latitude': 34.58222,
    'longitude': 133.71
},
'33442010': {
    'prefecture': 'Okayama',
    'location': 'Konkou',
    'latitude': 34.54,
    'longitude': 133.6275
},
'33444010': {
    'prefecture': 'Okayama',
    'location': 'Yorishima',
    'latitude': 34.47583,
    'longitude': 133.58556
},
'33503010': {
    'prefecture': 'Okayama',
    'location': 'Mabi',
    'latitude': 34.62472,
    'longitude': 133.69194
},
'33584510': {
    'prefecture': 'Okayama',
    'location': 'Kuze',
    'latitude': 35.07111,
    'longitude': 133.79444
},
'33681010': {
    'prefecture': 'Okayama',
    'location': 'Kibikougen',
    'latitude': 34.83444,
    'longitude': 133.76167
},
'34102020': {
    'prefecture': 'Hiroshima',
    'location': 'Fukugi_shougakkou',
    'latitude': 34.44278,
    'longitude': 132.53667
},
'34104510': {
    'prefecture': 'Hiroshima',
    'location': 'Kougo',
    'latitude': 34.38889,
    'longitude': 132.42611
},
'34105010': {
    'prefecture': 'Hirosima',
    'location': 'Asa_minami_kuyakusho_minami_sumi',
    'latitude': 34.44889,
    'longitude': 132.47361
},
'34105020': {
    'prefecture': 'Hirosima',
    'location': 'Tomo_shougakkou',
    'latitude': 34.45833,
    'longitude': 132.41
},
'34105510': {
    'prefecture': 'Hirosima',
    'location': 'Furuichi_shougakkou',
    'latitude': 34.45056,
    'longitude': 132.47361
},
'34201010': {
    'prefecture': 'Hiroshima',
    'location': 'Misasa_shougakkou',
    'latitude': 34.40972,
    'longitude': 132.45361
},
'34201020': {
    'prefecture': 'Hiroshima',
    'location': 'Minami_shougakkou',
    'latitude': 34.37556,
    'longitude': 132.47056
},
'34201250': {
    'prefecture': 'Hiroshima',
    'location': 'Inokuchi_shougakkou',
    'latitude': 34.36944,
    'longitude': 132.38611
},
'34201260': {
    'prefecture': 'Hiroshima',
    'location': 'Kabe_shougakkou',
    'latitude': 34.51528,
    'longitude': 132.5125
},
'34201510': {
    'prefecture': 'Hiroshima',
    'location': 'Kamiyatyou',
    'latitude': 34.39222,
    'longitude': 132.46111
},
'34201520': {
    'prefecture': 'Hiroshima',
    'location': 'Hijiyama',
    'latitude': 34.37667,
    'longitude': 132.47278
},
'34202010': {
    'prefecture': 'Hiroshima',
    'location': 'Meiritsushougakkou',
    'latitude': 34.25472,
    'longitude': 132.57611
},
'34202020': {
    'prefecture': 'Hiroshima',
    'location': 'Miyahara_shougakkou',
    'latitude': 34.23278,
    'longitude': 132.56111
},
'34202030': {
    'prefecture': 'Hiroshima',
    'location': 'Kure_nishi_shoubousho',
    'latitude': 34.2475,
    'longitude': 132.56111
},
'34202040': {
    'prefecture': 'Hiroshima',
    'location': 'siratakesyougakkou',
    'latitude': 34.23111,
    'longitude': 132.62833
},
'34202050': {
    'prefecture': 'Hiroshima',
    'location': 'Nabeyama_danchi',
    'latitude': 34.21917,
    'longitude': 132.54806
},
'34202510': {
    'prefecture': 'Hiroshima',
    'location': 'Nishihatachou',
    'latitude': 34.23639,
    'longitude': 132.58389
},
'34203010': {
    'prefecture': 'Hiroshima',
    'location': 'Takehara_koukou',
    'latitude': 34.33917,
    'longitude': 132.905
},
'34204150': {
    'prefecture': 'Hiroshima',
    'location': 'Miahramiyaurakouen',
    'latitude': 34.39833,
    'longitude': 133.07194
},
'34204520': {
    'prefecture': 'Hiroshima',
    'location': 'Miharamiyaokimachi',
    'latitude': 34.3925,
    'longitude': 133.07583
},
'34205010': {
    'prefecture': 'Hiroshima',
    'location': 'Onomichi_higashi_koukou',
    'latitude': 34.41222,
    'longitude': 133.21
},
'34207020': {
    'prefecture': 'Hiroshima',
    'location': 'Minami_shougakkou',
    'latitude': 34.48,
    'longitude': 133.37083
},
'34207040': {
    'prefecture': 'Hiroshima',
    'location': 'Baientyuugakkou',
    'latitude': 34.50833,
    'longitude': 133.41417
},
'34207060': {
    'prefecture': 'Hiroshima',
    'location': 'mukaigaokatyuugakkou',
    'latitude': 34.44028,
    'longitude': 133.38139
},
'34207090': {
    'prefecture': 'Hiroshima',
    'location': 'Akebonosyougakkou',
    'latitude': 34.46889,
    'longitude': 133.395
},
'34207100': {
    'prefecture': 'Hiroshima',
    'location': 'Matsunaga_shisho',
    'latitude': 34.44556,
    'longitude': 133.25889
},
'34207310': {
    'prefecture': 'Hiroshima',
    'location': 'ekiyahigasishougakkou',
    'latitude': 34.55472,
    'longitude': 133.33083
},
'34207320': {
    'prefecture': 'Hiroshima',
    'location': 'MATUNAGA SHOUGAKKOU',
    'latitude': 34.44028,
    'longitude': 133.25917
},
'34207510': {
    'prefecture': 'Hiroshima',
    'location': 'Fukuyamashiyakusyo',
    'latitude': 34.48167,
    'longitude': 133.365
},
'34208050': {
    'prefecture': 'Hiroshima',
    'location': 'Futyuushikyouikusenta-',
    'latitude': 34.56694,
    'longitude': 133.24583
},
'34209020': {
    'prefecture': 'Hiroshima',
    'location': 'Miyoshishitookaichimachi',
    'latitude': 34.79417,
    'longitude': 132.85611
},
'34211200': {
    'prefecture': 'Hiroshima',
    'location': 'Ootakeyuumikouen',
    'latitude': 34.21583,
    'longitude': 132.22222
},
'34212030': {
    'prefecture': 'Hiroshima',
    'location': 'Higashihiroshimasaijyousyougakkou',
    'latitude': 34.4175,
    'longitude': 132.74306
},
'34304010': {
    'prefecture': 'Hiroshima',
    'location': 'Kaita_koukou',
    'latitude': 34.36333,
    'longitude': 132.53167
},
'34322030': {
    'prefecture': 'Hiroshima',
    'location': 'Hatsukaitchikatsurakouen',
    'latitude': 34.35417,
    'longitude': 132.345
},
'34369010': {
    'prefecture': 'Hiroshima',
    'location': 'kitahiroshima',
    'latitude': 34.68806,
    'longitude': 132.54194
},
'34408010': {
    'prefecture': 'Hiroshima',
    'location': 'Kouchinyuuno',
    'latitude': 34.43556,
    'longitude': 132.86361
},
'34427010': {
    'prefecture': 'Hiroshima',
    'location': 'Oosakisyougakkou',
    'latitude': 34.23917,
    'longitude': 132.89167
},
'34501010': {
    'prefecture': 'Hiroshima',
    'location': 'Kannabejigyousyo',
    'latitude': 34.54389,
    'longitude': 133.37528
},
'35201010': {
    'prefecture': 'Yamaguchi',
    'location': 'Oduki_kyoku',
    'latitude': 34.06417,
    'longitude': 131.03167
},
'35201020': {
    'prefecture': 'Yamaguchi',
    'location': 'Choufu_kyoku',
    'latitude': 34.00056,
    'longitude': 130.99111
},
'35201030': {
    'prefecture': 'Yamaguchi',
    'location': 'Hikoshima_kyoku',
    'latitude': 33.93944,
    'longitude': 130.89833
},
'35201040': {
    'prefecture': 'Yamaguchi',
    'location': 'Yamanota_kyoku',
    'latitude': 33.98556,
    'longitude': 130.92972
},
'35201250': {
    'prefecture': 'Yamaguchi',
    'location': 'TOYOURAKYOKU',
    'latitude': 34.17139,
    'longitude': 130.93417
},
'35202020': {
    'prefecture': 'Yamaguchi',
    'location': 'Ube_sougoutyousya',
    'latitude': 33.95556,
    'longitude': 131.24972
},
'35202030': {
    'prefecture': 'Yamaguchi',
    'location': 'Misaki_jidoukouen',
    'latitude': 33.93278,
    'longitude': 131.26167
},
'35202040': {
    'prefecture': 'Yamaguchi',
    'location': 'Unoshima_shougakkou',
    'latitude': 33.96056,
    'longitude': 131.24194
},
'35202360': {
    'prefecture': 'Yamaguchi',
    'location': 'Kounan_shiminsenta',
    'latitude': 33.99056,
    'longitude': 131.22028
},
'35203010': {
    'prefecture': 'Yamaguchi',
    'location': 'kankyouhoken_senta',
    'latitude': 34.15,
    'longitude': 131.43611
},
'35204010': {
    'prefecture': 'Yamaguchi',
    'location': 'hagikenkoufukusisenta',
    'latitude': 34.40861,
    'longitude': 131.39583
},
'35205010': {
    'prefecture': 'Yamaguchi',
    'location': 'Syuunan_sougouchousha',
    'latitude': 34.05583,
    'longitude': 131.81028
},
'35205030': {
    'prefecture': 'Yamaguchi',
    'location': 'Kushigahama_shisho',
    'latitude': 34.02167,
    'longitude': 131.83278
},
'35205040': {
    'prefecture': 'Yamaguchi',
    'location': 'Tokuyama_kougyoukoukou',
    'latitude': 34.04167,
    'longitude': 131.83028
},
'35205520': {
    'prefecture': 'Yamaguchi',
    'location': 'Tsuji_kousaten',
    'latitude': 34.05556,
    'longitude': 131.81778
},
'35206010': {
    'prefecture': 'Yamaguchi',
    'location': 'Houfu_shiyakusho',
    'latitude': 34.04889,
    'longitude': 131.56528
},
'35206050': {
    'prefecture': 'Yamaguchi',
    'location': 'Nakanoseki_shougakkou',
    'latitude': 34.01528,
    'longitude': 131.5525
},
'35207020': {
    'prefecture': 'Yamaguchi',
    'location': 'Oonomi_suigenchi',
    'latitude': 34.01639,
    'longitude': 131.85528
},
'35207030': {
    'prefecture': 'Yamaguchi',
    'location': 'Toyoi_shougakkou',
    'latitude': 33.99556,
    'longitude': 131.88056
},
'35207090': {
    'prefecture': 'Yamaguchi',
    'location': 'Kudamatsu_shiyakusho',
    'latitude': 34.01222,
    'longitude': 131.87306
},
'35208010': {
    'prefecture': 'Yamaguchi',
    'location': 'Marifushougakkou',
    'latitude': 34.16972,
    'longitude': 132.21611
},
'35208030': {
    'prefecture': 'Yamaguchi',
    'location': 'Atago_shougakkou',
    'latitude': 34.14111,
    'longitude': 132.21583
},
'35209010': {
    'prefecture': 'Yamaguchi',
    'location': 'Sue_kenkoukouen',
    'latitude': 33.97194,
    'longitude': 131.18361
},
'35209020': {
    'prefecture': 'Yamaguchi',
    'location': 'Ryuuou_chuugakkou',
    'latitude': 33.955,
    'longitude': 131.185
},
'35210020': {
    'prefecture': 'Yamaguchi',
    'location': 'Asae_chuugakkou',
    'latitude': 33.97139,
    'longitude': 131.93222
},
'35210040': {
    'prefecture': 'Yamaguchi',
    'location': 'Hikari_koukou',
    'latitude': 33.95889,
    'longitude': 131.95306
},
'35211010': {
    'prefecture': 'Yamaguchi',
    'location': 'nagatodobokukentikujimusyo',
    'latitude': 34.36917,
    'longitude': 131.18444
},
'35212010': {
    'prefecture': 'Yamaguchi',
    'location': 'Yanai_shiyakusho',
    'latitude': 33.96139,
    'longitude': 132.10417
},
'35213010': {
    'prefecture': 'Yamaguchi',
    'location': 'Mine_shiyakusho',
    'latitude': 34.16361,
    'longitude': 131.20806
},
'35213020': {
    'prefecture': 'Yamaguchi',
    'location': 'Mineseiryokoukou',
    'latitude': 34.17667,
    'longitude': 131.21222
},
'35214010': {
    'prefecture': 'Yamaguchi',
    'location': 'Urayama_sousuijou',
    'latitude': 34.06806,
    'longitude': 131.78833
},
'35214020': {
    'prefecture': 'Yamaguchi',
    'location': 'Miyanomae_jidoukouen',
    'latitude': 34.07278,
    'longitude': 131.76528
},
'35321010': {
    'prefecture': 'Yamaguchi',
    'location': 'Waki_komyunitjisenta',
    'latitude': 34.20333,
    'longitude': 132.22111
},
'36201010': {
    'prefecture': 'Tokushima',
    'location': 'Kawauchi',
    'latitude': 34.10528,
    'longitude': 134.57778
},
'36201030': {
    'prefecture': 'Tokushima',
    'location': 'Oujin',
    'latitude': 34.1125,
    'longitude': 134.53028
},
'36201080': {
    'prefecture': 'Tokushima',
    'location': 'Tokushima',
    'latitude': 34.06667,
    'longitude': 134.56361
},
'36201110': {
    'prefecture': 'Tokushima',
    'location': 'Takara',
    'latitude': 34.03028,
    'longitude': 134.51194
},
'36201510': {
    'prefecture': 'Tokushima',
    'location': 'Jihai_Tokushima',
    'latitude': 34.06611,
    'longitude': 134.56083
},
'36202010': {
    'prefecture': 'Tokushima',
    'location': 'Naruto',
    'latitude': 34.17028,
    'longitude': 134.61556
},
'36203010': {
    'prefecture': 'Tokushima',
    'location': 'Komatushiama',
    'latitude': 34.00333,
    'longitude': 134.58833
},
'36204010': {
    'prefecture': 'Tokushima',
    'location': 'Anan',
    'latitude': 33.925,
    'longitude': 134.67139
},
'36204020': {
    'prefecture': 'Tokushima',
    'location': 'Oogata',
    'latitude': 33.88167,
    'longitude': 134.67139
},
'36204030': {
    'prefecture': 'Tokushima',
    'location': 'Yamaguchi',
    'latitude': 33.87194,
    'longitude': 134.61111
},
'36204040': {
    'prefecture': 'Tokushima',
    'location': 'Tsubaki',
    'latitude': 33.82833,
    'longitude': 134.68167
},
'36204050': {
    'prefecture': 'Tokushima',
    'location': 'Oono',
    'latitude': 33.93278,
    'longitude': 134.60306
},
'36204060': {
    'prefecture': 'Tokushima',
    'location': 'Takarada',
    'latitude': 33.92056,
    'longitude': 134.64278
},
'36204070': {
    'prefecture': 'Tokushima',
    'location': 'Tachibana',
    'latitude': 33.86889,
    'longitude': 134.64361
},
'36204080': {
    'prefecture': 'Tokushima',
    'location': 'Fukui',
    'latitude': 33.82167,
    'longitude': 134.60694
},
'36205010': {
    'prefecture': 'Tokushima',
    'location': 'Yoshinogawa',
    'latitude': 34.0675,
    'longitude': 134.35861
},
'36342010': {
    'prefecture': 'Tokushima',
    'location': 'Kamiyama',
    'latitude': 33.96917,
    'longitude': 134.36333
},
'36361010': {
    'prefecture': 'Tokushima',
    'location': 'Nakagawa',
    'latitude': 33.95944,
    'longitude': 134.64333
},
'36361030': {
    'prefecture': 'Tokushima',
    'location': 'Nakajima',
    'latitude': 33.93861,
    'longitude': 134.68
},
'36362010': {
    'prefecture': 'Tokushima',
    'location': 'Hanoura',
    'latitude': 33.9425,
    'longitude': 134.62139
},
'36363010': {
    'prefecture': 'Tokushima',
    'location': 'Wajiki',
    'latitude': 33.85417,
    'longitude': 134.49694
},
'36381010': {
    'prefecture': 'Tokushima',
    'location': 'Yuki',
    'latitude': 33.77389,
    'longitude': 134.6
},
'36401010': {
    'prefecture': 'Tokushima',
    'location': 'Matsushige',
    'latitude': 34.12889,
    'longitude': 134.5925
},
'36402010': {
    'prefecture': 'Tokushima',
    'location': 'Kitajima',
    'latitude': 34.11528,
    'longitude': 134.54611
},
'36403010': {
    'prefecture': 'Tokushima',
    'location': 'Aizumi',
    'latitude': 34.11833,
    'longitude': 134.49944
},
'36461010': {
    'prefecture': 'Tokushima',
    'location': 'Wakimachi',
    'latitude': 34.0625,
    'longitude': 134.16528
},
'36483010': {
    'prefecture': 'Tokusima',
    'location': 'Ikeda',
    'latitude': 34.02361,
    'longitude': 133.80111
},
'37201010': {
    'prefecture': 'Kagawa',
    'location': 'Takamatsu_keirinjou',
    'latitude': 34.34222,
    'longitude': 134.06361
},
'37201080': {
    'prefecture': 'Kagawa',
    'location': 'KOKUBUNJI',
    'latitude': 34.30222,
    'longitude': 133.96278
},
'37201090': {
    'prefecture': 'Kagawa',
    'location': 'toubuundoukouen',
    'latitude': 34.32806,
    'longitude': 134.12139
},
'37201100': {
    'prefecture': 'Kagawa',
    'location': 'minamishouboushokagawabunsho',
    'latitude': 34.23361,
    'longitude': 134.035
},
'37201510': {
    'prefecture': 'Kagawa',
    'location': 'Ritsurin_kouen_mae',
    'latitude': 34.3275,
    'longitude': 134.04917
},
'37201540': {
    'prefecture': 'Kagawa',
    'location': 'Takamatsu_shiyakusho',
    'latitude': 34.33722,
    'longitude': 134.05
},
'37201550': {
    'prefecture': 'Kagawa',
    'location': 'Tsuruokomyunithisenta-',
    'latitude': 34.31444,
    'longitude': 134.02833
},
'37202010': {
    'prefecture': 'Kagawa',
    'location': 'Marugame_shiyakusho',
    'latitude': 34.28667,
    'longitude': 133.80111
},
'37202020': {
    'prefecture': 'Kagawa',
    'location': 'Marugame_kyouteijou',
    'latitude': 34.30167,
    'longitude': 133.79778
},
'37202030': {
    'prefecture': 'Kagawa',
    'location': 'Joukon_shougakkou',
    'latitude': 34.27667,
    'longitude': 133.78889
},
'37202070': {
    'prefecture': 'Kagawa',
    'location': 'aonoyama',
    'latitude': 34.29972,
    'longitude': 133.81639
},
'37203010': {
    'prefecture': 'Kagawa',
    'location': 'Sakaide_shiyakusho',
    'latitude': 34.32028,
    'longitude': 133.85833
},
'37203020': {
    'prefecture': 'Kagawa',
    'location': 'Seijima',
    'latitude': 34.34944,
    'longitude': 133.85083
},
'37203040': {
    'prefecture': 'Kagawa',
    'location': 'Sagamibou_jinja',
    'latitude': 34.36222,
    'longitude': 133.89528
},
'37203050': {
    'prefecture': 'Kagawa',
    'location': 'Hayashida_shucchousho',
    'latitude': 34.31972,
    'longitude': 133.89
},
'37203110': {
    'prefecture': 'Kagawa',
    'location': 'Kawatsu',
    'latitude': 34.29667,
    'longitude': 133.85
},
'37203120': {
    'prefecture': 'Kagawa',
    'location': 'Iwagurojima',
    'latitude': 34.40361,
    'longitude': 133.81333
},
'37203130': {
    'prefecture': 'Kagawa',
    'location': 'Hitsuishijima',
    'latitude': 34.42111,
    'longitude': 133.80833
},
'37204010': {
    'prefecture': 'Kagawa',
    'location': 'Zentuujisiyakusyo',
    'latitude': 34.22444,
    'longitude': 133.78944
},
'37205010': {
    'prefecture': 'Kagawa',
    'location': 'Kannojisiaykusyo',
    'latitude': 34.12444,
    'longitude': 133.66444
},
'37206010': {
    'prefecture': 'Kagawa',
    'location': 'Tousanhokenfukushi',
    'latitude': 34.28944,
    'longitude': 134.24833
},
'37322010': {
    'prefecture': 'Kagawa',
    'location': 'Shouzujimusho',
    'latitude': 34.48528,
    'longitude': 134.19111
},
'37364010': {
    'prefecture': 'Kagawa',
    'location': 'Naoshima-chou_yakuba',
    'latitude': 34.45667,
    'longitude': 133.99806
},
'37386010': {
    'prefecture': 'Kagawa',
    'location': 'Utazumachiyakua',
    'latitude': 34.31,
    'longitude': 133.82611
},
'37404010': {
    'prefecture': 'Kagawa',
    'location': 'Tadotsumachiyakuba',
    'latitude': 34.26944,
    'longitude': 133.75639
},
'38201020': {
    'prefecture': 'Ehime',
    'location': 'TOMIHISATYOU',
    'latitude': 33.81972,
    'longitude': 132.72833
},
'38201030': {
    'prefecture': 'Ehime',
    'location': 'WAKE',
    'latitude': 33.88833,
    'longitude': 132.73278
},
'38201080': {
    'prefecture': 'Ehime',
    'location': 'MIBU',
    'latitude': 33.84167,
    'longitude': 132.7275
},
'38201090': {
    'prefecture': 'Ehime',
    'location': 'HABUSYOUGAKKOU',
    'latitude': 33.81361,
    'longitude': 132.70417
},
'38201510': {
    'prefecture': 'Ehime',
    'location': 'HONMATHISYOUBOU',
    'latitude': 33.85194,
    'longitude': 132.75861
},
'38201530': {
    'prefecture': 'Ehime',
    'location': 'ASODA',
    'latitude': 33.82139,
    'longitude': 132.76333
},
'38202100': {
    'prefecture': 'Ehime',
    'location': 'IMABARIASAHI',
    'latitude': 34.06333,
    'longitude': 132.99944
},
'38203010': {
    'prefecture': 'Ehime',
    'location': 'UWAJIMA',
    'latitude': 33.22778,
    'longitude': 132.57056
},
'38204010': {
    'prefecture': 'Ehime',
    'location': 'Yawatahama',
    'latitude': 33.46167,
    'longitude': 132.42194
},
'38205010': {
    'prefecture': 'Ehime',
    'location': 'Kaneko',
    'latitude': 33.95444,
    'longitude': 133.28361
},
'38205020': {
    'prefecture': 'Ehime',
    'location': 'Nihama_koukou',
    'latitude': 33.95833,
    'longitude': 133.2675
},
'38205030': {
    'prefecture': 'Ehime',
    'location': 'Wakamiya',
    'latitude': 33.95444,
    'longitude': 133.26611
},
'38205040': {
    'prefecture': 'Ehime',
    'location': 'Kita-Komatsubara',
    'latitude': 33.9725,
    'longitude': 133.29444
},
'38205050': {
    'prefecture': 'Ehime',
    'location': 'Oujouin',
    'latitude': 33.91694,
    'longitude': 133.25639
},
'38205060': {
    'prefecture': 'Ehime',
    'location': 'Nakamura',
    'latitude': 33.92833,
    'longitude': 133.28222
},
'38205080': {
    'prefecture': 'Ehime',
    'location': 'Takatsu',
    'latitude': 33.97111,
    'longitude': 133.30583
},
'38205090': {
    'prefecture': 'Ehime',
    'location': 'Izumikawa',
    'latitude': 33.935,
    'longitude': 133.30639
},
'38205100': {
    'prefecture': 'Ehime',
    'location': 'Takihama',
    'latitude': 33.97556,
    'longitude': 133.34167
},
'38206010': {
    'prefecture': 'Ehime',
    'location': 'Kanbai',
    'latitude': 33.90889,
    'longitude': 133.18389
},
'38206020': {
    'prefecture': 'Ehime',
    'location': 'Iioka',
    'latitude': 33.91639,
    'longitude': 133.22972
},
'38206030': {
    'prefecture': 'Ehime',
    'location': 'Himi',
    'latitude': 33.89583,
    'longitude': 133.13694
},
'38206050': {
    'prefecture': 'Ehime',
    'location': 'Saijou',
    'latitude': 33.915,
    'longitude': 133.19583
},
'38206070': {
    'prefecture': 'Ehime',
    'location': 'Teizui',
    'latitude': 33.91167,
    'longitude': 133.14278
},
'38208010': {
    'prefecture': 'Ehime',
    'location': 'Kinsei',
    'latitude': 33.99944,
    'longitude': 133.58333
},
'38208020': {
    'prefecture': 'Ehime',
    'location': 'Kisshouin',
    'latitude': 34.01056,
    'longitude': 133.57583
},
'38208030': {
    'prefecture': 'Ehime',
    'location': 'Kawanoe',
    'latitude': 33.98806,
    'longitude': 133.58917
},
'38209010': {
    'prefecture': 'Ehime',
    'location': 'kougyouyousuichi',
    'latitude': 33.98444,
    'longitude': 133.56194
},
'38209020': {
    'prefecture': 'Ehime',
    'location': 'Kyu_Kenjimusho',
    'latitude': 33.97444,
    'longitude': 133.54389
},
'38209030': {
    'prefecture': 'Ehime',
    'location': 'Sangawa',
    'latitude': 33.96139,
    'longitude': 133.51889
},
'38209050': {
    'prefecture': 'Ehime',
    'location': 'Iyomishima',
    'latitude': 33.97694,
    'longitude': 133.55278
},
'38212010': {
    'prefecture': 'Ehime',
    'location': 'Touyohigashichuugakkou',
    'latitude': 33.91639,
    'longitude': 133.08778
},
'38212020': {
    'prefecture': 'Ehime',
    'location': 'Touyokitahoikusho',
    'latitude': 33.93278,
    'longitude': 133.05722
},
'38212040': {
    'prefecture': 'Ehime',
    'location': 'Touyo',
    'latitude': 33.92917,
    'longitude': 133.08222
},
'38302020': {
    'prefecture': 'Ehime',
    'location': 'Doi',
    'latitude': 33.9475,
    'longitude': 133.42083
},
'38321010': {
    'prefecture': 'Ehime',
    'location': 'Iwane',
    'latitude': 33.87917,
    'longitude': 133.07778
},
'38321020': {
    'prefecture': 'Ehime',
    'location': 'Komatsu_chuugakkou',
    'latitude': 33.8875,
    'longitude': 133.09028
},
'38323010': {
    'prefecture': 'Ehime',
    'location': 'Tanbara',
    'latitude': 33.89611,
    'longitude': 133.05972
},
'38323020': {
    'prefecture': 'Ehime',
    'location': 'Kurumi',
    'latitude': 33.86139,
    'longitude': 133.03
},
'38380010': {
    'prefecture': 'Ehime',
    'location': 'KUMAKOUGENN',
    'latitude': 33.64389,
    'longitude': 132.91306
},
'38401010': {
    'prefecture': 'Ehime',
    'location': 'MASAKI',
    'latitude': 33.78056,
    'longitude': 132.69917
},
'38421010': {
    'prefecture': 'Ehime',
    'location': 'OOYA',
    'latitude': 33.62139,
    'longitude': 132.50417
},
'39201350': {
    'prefecture': 'Kochi',
    'location': 'Kera',
    'latitude': 33.55028,
    'longitude': 133.59889
},
'39201360': {
    'prefecture': 'Kochi',
    'location': 'minamishintachou',
    'latitude': 33.54556,
    'longitude': 133.55778
},
'39201530': {
    'prefecture': 'Kochi',
    'location': 'Asakura',
    'latitude': 33.54,
    'longitude': 133.48972
},
'39203010': {
    'prefecture': 'Kochi',
    'location': 'Aki',
    'latitude': 33.50667,
    'longitude': 133.9025
},
'39204070': {
    'prefecture': 'Kochi',
    'location': 'inabu',
    'latitude': 33.55056,
    'longitude': 133.62194
},
'39206020': {
    'prefecture': 'Kochi',
    'location': 'susakiｆukushihokensyo',
    'latitude': 33.3875,
    'longitude': 133.28972
},
'39206080': {
    'prefecture': 'Kochi',
    'location': 'Oshiokakouen',
    'latitude': 33.39944,
    'longitude': 133.32083
},
'39210010': {
    'prefecture': 'Kochi',
    'location': 'Nakamura',
    'latitude': 32.98028,
    'longitude': 132.90528
},
'39212010': {
    'prefecture': 'Kochi',
    'location': 'tosayamada',
    'latitude': 33.59611,
    'longitude': 133.68972
},
'39381030': {
    'prefecture': 'Kochi',
    'location': 'Inogoudoutyousya',
    'latitude': 33.54694,
    'longitude': 133.43278
},
'39405950': {
    'prefecture': 'Kochi',
    'location': 'Kokusetsu_Yusuhara',
    'latitude': 33.37917,
    'longitude': 132.93472
},
'40101010': {
    'prefecture': 'Fukuoka',
    'location': 'MOJI KYOKU',
    'latitude': 33.89583,
    'longitude': 130.93583
},
'40101020': {
    'prefecture': 'Fukuoka',
    'location': 'MATSUGAE KYOKU',
    'latitude': 33.86861,
    'longitude': 130.97889
},
'40101510': {
    'prefecture': 'Fukuoka',
    'location': 'MOJIKOU JIHAIKYOKU',
    'latitude': 33.94472,
    'longitude': 130.97111
},
'40103010': {
    'prefecture': 'Fukuoka',
    'location': 'WAKAMATSU KYOKU',
    'latitude': 33.89806,
    'longitude': 130.81
},
'40103120': {
    'prefecture': 'Fukuoka',
    'location': 'EGAWA KYOKU',
    'latitude': 33.89361,
    'longitude': 130.69361
},
'40103130': {
    'prefecture': 'Fukuoka',
    'location': 'Wakamatsu_Hibiki kyoku',
    'latitude': 33.92056,
    'longitude': 130.78667
},
'40105010': {
    'prefecture': 'Fukuoka',
    'location': 'TOBATA KYOKU',
    'latitude': 33.89194,
    'longitude': 130.83167
},
'40106010': {
    'prefecture': 'Fukuoka',
    'location': 'KITAKYUSHU KYOKU',
    'latitude': 33.88361,
    'longitude': 130.85389
},
'40106020': {
    'prefecture': 'Fukuoka',
    'location': 'KOKURA KYOKU',
    'latitude': 33.88083,
    'longitude': 130.87306
},
'40106510': {
    'prefecture': 'Fukuoka',
    'location': 'MIHAGINO JIHAIKYOKU',
    'latitude': 33.86917,
    'longitude': 130.88306
},
'40107020': {
    'prefecture': 'Fukuoka',
    'location': 'SONE KYOKU',
    'latitude': 33.82694,
    'longitude': 130.94194
},
'40107040': {
    'prefecture': 'Fukuoka',
    'location': 'KIKUGAOKA KYOKU',
    'latitude': 33.81889,
    'longitude': 130.87806
},
'40108010': {
    'prefecture': 'Fukuoka',
    'location': 'YAHATA KYOKU',
    'latitude': 33.86056,
    'longitude': 130.815
},
'40108510': {
    'prefecture': 'Fukuoka',
    'location': 'NISHIHONMACHI JIHAIKYOKU',
    'latitude': 33.865,
    'longitude': 130.80222
},
'40109010': {
    'prefecture': 'Fukuoka',
    'location': 'KUROSAKI KYOKU',
    'latitude': 33.85833,
    'longitude': 130.76278
},
'40109030': {
    'prefecture': 'Fukuoka',
    'location': 'TOUNO KYOKU',
    'latitude': 33.82194,
    'longitude': 130.74028
},
'40109510': {
    'prefecture': 'Fukuoka',
    'location': 'KUROSAKI JIHAIKYOKU',
    'latitude': 33.86278,
    'longitude': 130.76833
},
'40131010': {
    'prefecture': 'Fukuoka',
    'location': 'Higashi',
    'latitude': 33.63278,
    'longitude': 130.42944
},
'40131030': {
    'prefecture': 'Fukuoka',
    'location': 'Kashii',
    'latitude': 33.66944,
    'longitude': 130.44056
},
'40132010': {
    'prefecture': 'Fukuoka',
    'location': 'Yoshiduka',
    'latitude': 33.60389,
    'longitude': 130.43028
},
'40132520': {
    'prefecture': 'Fukuoka',
    'location': 'Hie',
    'latitude': 33.58722,
    'longitude': 130.43083
},
'40132530': {
    'prefecture': 'Fukuoka',
    'location': 'Chidoribashi',
    'latitude': 33.60167,
    'longitude': 130.4125
},
'40133010': {
    'prefecture': 'Fukuoka',
    'location': 'Fukuokashiyakusyo',
    'latitude': 33.5875,
    'longitude': 130.40333
},
'40133510': {
    'prefecture': 'Fukuoka',
    'location': 'Tenjin',
    'latitude': 33.58833,
    'longitude': 130.40083
},
'40133520': {
    'prefecture': 'Fukuoka',
    'location': 'Hirao',
    'latitude': 33.57,
    'longitude': 130.40778
},
'40134010': {
    'prefecture': 'Fukuoka',
    'location': 'Minami',
    'latitude': 33.56083,
    'longitude': 130.43472
},
'40134510': {
    'prefecture': 'Fukuoka',
    'location': 'Oohashi',
    'latitude': 33.55083,
    'longitude': 130.43611
},
'40135020': {
    'prefecture': 'Fukuoka',
    'location': 'Nagao',
    'latitude': 33.55389,
    'longitude': 130.38306
},
'40135060': {
    'prefecture': 'Fukuoka',
    'location': 'Motooka',
    'latitude': 33.58278,
    'longitude': 130.255
},
'40135510': {
    'prefecture': 'Fukuoka',
    'location': 'Nishijin',
    'latitude': 33.58056,
    'longitude': 130.36194
},
'40135520': {
    'prefecture': 'Fukuoka',
    'location': 'Befubashi',
    'latitude': 33.57194,
    'longitude': 130.37472
},
'40135530': {
    'prefecture': 'Fukuoka',
    'location': 'Ishimaru',
    'latitude': 33.57111,
    'longitude': 130.31889
},
'40135540': {
    'prefecture': 'Fukuoka',
    'location': 'imajyuku',
    'latitude': 33.56889,
    'longitude': 130.27861
},
'40137010': {
    'prefecture': 'Fukuoka',
    'location': 'sohara',
    'latitude': 33.57667,
    'longitude': 130.35861
},
'40202010': {
    'prefecture': 'Fukuoka',
    'location': 'Kokusetsu_Omuta',
    'latitude': 33.02667,
    'longitude': 130.44833
},
'40202030': {
    'prefecture': 'Fukuoka',
    'location': 'Mikawa',
    'latitude': 33.00861,
    'longitude': 130.43333
},
'40202040': {
    'prefecture': 'Fukuoka',
    'location': 'Meiji',
    'latitude': 33.04,
    'longitude': 130.45417
},
'40202050': {
    'prefecture': 'Fukuoka',
    'location': 'Nanaura',
    'latitude': 33.02028,
    'longitude': 130.45833
},
'40202060': {
    'prefecture': 'Fukuoka',
    'location': 'Shinchi',
    'latitude': 33.03083,
    'longitude': 130.43778
},
'40202080': {
    'prefecture': 'Fukuoka',
    'location': 'Tachibana',
    'latitude': 33.06111,
    'longitude': 130.4775
},
'40202250': {
    'prefecture': 'Fukuoka',
    'location': 'Katsutachi',
    'latitude': 33.01028,
    'longitude': 130.4775
},
'40202510': {
    'prefecture': 'Fukuoka',
    'location': 'Shiranuhi',
    'latitude': 33.02667,
    'longitude': 130.44333
},
'40202530': {
    'prefecture': 'Fukuoka',
    'location': 'Suwa',
    'latitude': 33.01611,
    'longitude': 130.43333
},
'40203060': {
    'prefecture': 'Fukuoka',
    'location': 'E-rupiakurume',
    'latitude': 33.30028,
    'longitude': 130.51889
},
'40203070': {
    'prefecture': 'Fukuoka',
    'location': 'mizumachuugakkou',
    'latitude': 33.25444,
    'longitude': 130.46667
},
'40203100': {
    'prefecture': 'Fukuoka',
    'location': 'jyounantyuugakkou',
    'latitude': 33.31583,
    'longitude': 130.51056
},
'40203110': {
    'prefecture': 'Fukuoka',
    'location': 'tanusimarutyuugakkou',
    'latitude': 33.34944,
    'longitude': 130.69028
},
'40204010': {
    'prefecture': 'Fukuoka',
    'location': 'Noogata',
    'latitude': 33.74167,
    'longitude': 130.73194
},
'40205010': {
    'prefecture': 'Fukuoka',
    'location': 'iizuka',
    'latitude': 33.61167,
    'longitude': 130.7
},
'40206010': {
    'prefecture': 'Fukuoka',
    'location': 'Tagawa',
    'latitude': 33.63028,
    'longitude': 130.77583
},
'40210010': {
    'prefecture': 'Fukuoka',
    'location': 'yame',
    'latitude': 33.19778,
    'longitude': 130.59444
},
'40214010': {
    'prefecture': 'Fukuoka',
    'location': 'Buzen',
    'latitude': 33.60806,
    'longitude': 131.13306
},
'40216010': {
    'prefecture': 'Fukuoka',
    'location': 'Kokusetsu_Chikugogoori',
    'latitude': 33.40417,
    'longitude': 130.5825
},
'40220010': {
    'prefecture': 'Fukuoka',
    'location': 'Munakata',
    'latitude': 33.80222,
    'longitude': 130.54333
},
'40221010': {
    'prefecture': 'Fukuoka',
    'location': 'Dazaifu',
    'latitude': 33.51056,
    'longitude': 130.50333
},
'40222010': {
    'prefecture': 'Fukuoka',
    'location': 'Itoshima',
    'latitude': 33.56028,
    'longitude': 130.21083
},
'40223510': {
    'prefecture': 'Fukuoka',
    'location': 'koga',
    'latitude': 33.71917,
    'longitude': 130.46361
},
'40228010': {
    'prefecture': 'Fukuoka',
    'location': 'asakura',
    'latitude': 33.36,
    'longitude': 130.8175
},
'40342010': {
    'prefecture': 'Fukuoka',
    'location': 'sasaguri',
    'latitude': 33.62222,
    'longitude': 130.52639
},
'40563010': {
    'prefecture': 'Fukuoka',
    'location': 'Yanagawa',
    'latitude': 33.15417,
    'longitude': 130.41861
},
'40621010': {
    'prefecture': 'Fukuoka',
    'location': 'Kanda',
    'latitude': 33.77278,
    'longitude': 130.98306
},
'41201030': {
    'prefecture': 'Saga',
    'location': 'Saga',
    'latitude': 33.25306,
    'longitude': 130.31083
},
'41201040': {
    'prefecture': 'Saga',
    'location': 'MITSUSE',
    'latitude': 33.42778,
    'longitude': 130.28028
},
'41201540': {
    'prefecture': 'Saga',
    'location': 'Hyougo',
    'latitude': 33.27722,
    'longitude': 130.30917
},
'41202060': {
    'prefecture': 'Saga',
    'location': 'Takekiba',
    'latitude': 33.41694,
    'longitude': 129.92167
},
'41202080': {
    'prefecture': 'Saga',
    'location': 'Minato',
    'latitude': 33.51917,
    'longitude': 129.95472
},
'41202160': {
    'prefecture': 'Saga',
    'location': 'Hizen',
    'latitude': 33.44056,
    'longitude': 129.81694
},
'41202200': {
    'prefecture': 'Saga',
    'location': 'karatu',
    'latitude': 33.45972,
    'longitude': 129.95528
},
'41203010': {
    'prefecture': 'Saga',
    'location': 'Tosu ',
    'latitude': 33.37583,
    'longitude': 130.52472
},
'41203050': {
    'prefecture': 'Saga',
    'location': 'Sonezaki',
    'latitude': 33.37583,
    'longitude': 130.5225
},
'41203060': {
    'prefecture': 'Saga',
    'location': 'Asahi',
    'latitude': 33.35222,
    'longitude': 130.49278
},
'41204010': {
    'prefecture': 'Saga',
    'location': 'Taku',
    'latitude': 33.28333,
    'longitude': 130.11333
},
'41205080': {
    'prefecture': 'Saga',
    'location': 'Ootsubo',
    'latitude': 33.27139,
    'longitude': 129.88861
},
'41205090': {
    'prefecture': 'Saga',
    'location': 'Yamashiro',
    'latitude': 33.30667,
    'longitude': 129.81444
},
'41206010': {
    'prefecture': 'Saga',
    'location': 'Takeo',
    'latitude': 33.19417,
    'longitude': 130.02778
},
'41207010': {
    'prefecture': 'Saga',
    'location': 'Kashima',
    'latitude': 33.09972,
    'longitude': 130.10222
},
'41209010': {
    'prefecture': 'Saga',
    'location': 'Ureshino',
    'latitude': 33.10139,
    'longitude': 129.98222
},
'41210010': {
    'prefecture': 'Saga',
    'location': 'Kanzaki',
    'latitude': 33.305,
    'longitude': 130.37389
},
'41341010': {
    'prefecture': 'Saga',
    'location': 'Kiyama',
    'latitude': 33.40333,
    'longitude': 130.52806
},
'41401020': {
    'prefecture': 'Saga',
    'location': 'NISHIARITA',
    'latitude': 33.27389,
    'longitude': 129.84194
},
'41425010': {
    'prefecture': 'Saga',
    'location': 'shiroishi',
    'latitude': 33.18472,
    'longitude': 130.14944
},
'42201030': {
    'prefecture': 'Nagasaki',
    'location': 'Inasa_shougakkou',
    'latitude': 32.75333,
    'longitude': 129.86278
},
'42201040': {
    'prefecture': 'Nagasaki',
    'location': 'Kita_shoubousho',
    'latitude': 32.77972,
    'longitude': 129.865
},
'42201280': {
    'prefecture': 'Nagasaki',
    'location': 'Kogakura_shisho',
    'latitude': 32.70306,
    'longitude': 129.85278
},
'42201300': {
    'prefecture': 'Nagasaki',
    'location': 'Higashi-Nagasaki_shisho',
    'latitude': 32.77472,
    'longitude': 129.955
},
'42201510': {
    'prefecture': 'Nagasaki',
    'location': 'Nagasaki_eki_mae',
    'latitude': 32.74833,
    'longitude': 129.87417
},
'42201520': {
    'prefecture': 'Nagasaki',
    'location': 'Chuuoubashi',
    'latitude': 32.74111,
    'longitude': 129.87917
},
'42201530': {
    'prefecture': 'Nagasaki',
    'location': 'Nagasaki_shiyakusho',
    'latitude': 32.74694,
    'longitude': 129.87833
},
'42201540': {
    'prefecture': 'Nagasaki',
    'location': 'chuuoubashi',
    'latitude': 32.74417,
    'longitude': 129.87583
},
'42202020': {
    'prefecture': 'Nagasaki',
    'location': 'Ainoura',
    'latitude': 33.19167,
    'longitude': 129.66889
},
'42202030': {
    'prefecture': 'Nagasaki',
    'location': 'Oono',
    'latitude': 33.20583,
    'longitude': 129.72222
},
'42202140': {
    'prefecture': 'Nagasaki',
    'location': 'Haiki',
    'latitude': 33.13278,
    'longitude': 129.80056
},
'42202160': {
    'prefecture': 'Nagasaki',
    'location': 'Daitou',
    'latitude': 33.1425,
    'longitude': 129.78111
},
'42202510': {
    'prefecture': 'Nagasaki',
    'location': 'Hiu',
    'latitude': 33.15417,
    'longitude': 129.75611
},
'42202520': {
    'prefecture': 'Nagasaki',
    'location': 'Fukuishi',
    'latitude': 33.15667,
    'longitude': 129.73389
},
'42203010': {
    'prefecture': 'Nagasaki',
    'location': 'shimabarataikisokuteikyoku',
    'latitude': 32.78889,
    'longitude': 130.37472
},
'42204060': {
    'prefecture': 'Nagasaki',
    'location': 'Isahaya',
    'latitude': 32.84222,
    'longitude': 130.01639
},
'42205010': {
    'prefecture': 'Nagasaki',
    'location': 'omurataikisokuteikyoku',
    'latitude': 32.90972,
    'longitude': 129.96278
},
'42208040': {
    'prefecture': 'Nagasaki',
    'location': 'Matsuurashisakyoku',
    'latitude': 33.33833,
    'longitude': 129.71278
},
'42209010': {
    'prefecture': 'Nagasaki',
    'location': 'Tsushimasokuteikyoku',
    'latitude': 34.21028,
    'longitude': 129.28944
},
'42209950': {
    'prefecture': 'Nagasaki',
    'location': 'Kokusetsu_Tsushima',
    'latitude': 34.24167,
    'longitude': 129.28583
},
'42210010': {
    'prefecture': 'Nagasaki',
    'location': 'Iki',
    'latitude': 33.75,
    'longitude': 129.69083
},
'42211010': {
    'prefecture': 'Nagasaki',
    'location': 'Gotou',
    'latitude': 32.69639,
    'longitude': 128.84
},
'42211950': {
    'prefecture': 'Nagasaki',
    'location': 'Kokusetsu_Goto',
    'latitude': 32.60639,
    'longitude': 128.65667
},
'42213010': {
    'prefecture': 'Nagasaki',
    'location': 'obamataikisokuteikyoku',
    'latitude': 32.74722,
    'longitude': 130.20083
},
'42308040': {
    'prefecture': 'Nagasaki',
    'location': 'togitsushogakkotaikisokuteikyoku',
    'latitude': 32.82556,
    'longitude': 129.85
},
'42309010': {
    'prefecture': 'Nagasaki',
    'location': 'Muramatsu',
    'latitude': 32.86139,
    'longitude': 129.78944
},
'42314020': {
    'prefecture': 'Nagasaki',
    'location': 'Yukinoura',
    'latitude': 32.91889,
    'longitude': 129.66778
},
'42322060': {
    'prefecture': 'Nagasaki',
    'location': 'kawatanataikisokuteikyoku',
    'latitude': 33.06306,
    'longitude': 129.86
},
'42392020': {
    'prefecture': 'Nagasaki',
    'location': 'Yoshii',
    'latitude': 33.25944,
    'longitude': 129.69528
},
'43201110': {
    'prefecture': 'Kumamoto',
    'location': 'Hanahadachou',
    'latitude': 32.79917,
    'longitude': 130.70556
},
'43201140': {
    'prefecture': 'Kumamoto',
    'location': 'Niregi',
    'latitude': 32.84806,
    'longitude': 130.75389
},
'43201150': {
    'prefecture': 'Kumamoto',
    'location': 'Kyoumachi',
    'latitude': 32.81667,
    'longitude': 130.70278
},
'43201160': {
    'prefecture': 'Kumamoto',
    'location': 'kitakuyakusyo',
    'latitude': 32.90389,
    'longitude': 130.69361
},
'43201170': {
    'prefecture': 'Kumamoto',
    'location': 'akitu',
    'latitude': 32.77083,
    'longitude': 130.77111
},
'43201180': {
    'prefecture': 'Kumamoto',
    'location': 'nakajima',
    'latitude': 32.76611,
    'longitude': 130.62639
},
'43201190': {
    'prefecture': 'Kumamoto',
    'location': 'zyonanmati',
    'latitude': 32.72611,
    'longitude': 130.71389
},
'43201510': {
    'prefecture': 'Kumamoto',
    'location': 'Suidoumatijihaikyoku',
    'latitude': 32.80056,
    'longitude': 130.71639
},
'43201520': {
    'prefecture': 'Kumamoto',
    'location': 'Kuwamizuhonmachi',
    'latitude': 32.77889,
    'longitude': 130.7475
},
'43202020': {
    'prefecture': 'Kumamoto',
    'location': 'Yatsushiro_shiyakusho',
    'latitude': 32.50444,
    'longitude': 130.60417
},
'43202030': {
    'prefecture': 'Kumamoto',
    'location': 'Yatushiroyachiwasyuttyoujyo',
    'latitude': 32.51389,
    'longitude': 130.61472
},
'43202520': {
    'prefecture': 'Kumamoto',
    'location': 'Yatsushiro_jihaikyoku',
    'latitude': 32.49944,
    'longitude': 130.64056
},
'43203011': {
    'prefecture': 'Kumamoto',
    'location': 'hitoyoshihokensho',
    'latitude': 32.20639,
    'longitude': 130.75861
},
'43204020': {
    'prefecture': 'Kumamoto',
    'location': 'Arao_Nishibaru_jidoukouen',
    'latitude': 32.99833,
    'longitude': 130.43389
},
'43204200': {
    'prefecture': 'Kuamoto',
    'location': 'Araoundoukouen',
    'latitude': 32.98056,
    'longitude': 130.46722
},
'43205030': {
    'prefecture': 'Kumamoto',
    'location': 'Minamata_Marushima',
    'latitude': 32.20778,
    'longitude': 130.39194
},
'43205160': {
    'prefecture': 'Kumamoto',
    'location': 'Minamata_hokenjo',
    'latitude': 32.21028,
    'longitude': 130.40167
},
'43206020': {
    'prefecture': 'Kumamoto',
    'location': 'Ariake_hokenjo',
    'latitude': 32.92778,
    'longitude': 130.56083
},
'43207010': {
    'prefecture': 'Kumamoto',
    'location': 'Amakusa_hokenjo',
    'latitude': 32.45722,
    'longitude': 130.19806
},
'43208010': {
    'prefecture': 'Kumamoto',
    'location': 'Yamaga_kenkousenta',
    'latitude': 33.00639,
    'longitude': 130.70278
},
'43210010': {
    'prefecture': 'Kumamoto',
    'location': 'Kikuchi_shiyakusho',
    'latitude': 32.97667,
    'longitude': 130.81528
},
'43211050': {
    'prefecture': 'Kumamoto',
    'location': 'Uto_undoukouen',
    'latitude': 32.68139,
    'longitude': 130.66667
},
'43212010': {
    'prefecture': 'Kumamoto',
    'location': 'kamiamakusachiaitsu',
    'latitude': 32.51611,
    'longitude': 130.43278
},
'43214011': {
    'prefecture': 'Kumamoto',
    'location': 'asohokensho',
    'latitude': 32.93861,
    'longitude': 131.11417
},
'43215010': {
    'prefecture': 'Kumamoto',
    'location': 'Hondomiyajidake',
    'latitude': 32.38417,
    'longitude': 130.12639
},
'43215020': {
    'prefecture': 'Kumamoto',
    'location': 'Shinwakomiyaji',
    'latitude': 32.38222,
    'longitude': 130.19833
},
'43215030': {
    'prefecture': 'Kumamoto',
    'location': 'Kawaura',
    'latitude': 32.32417,
    'longitude': 130.07167
},
'43215040': {
    'prefecture': 'Kumamoto',
    'location': 'Amakusashimoda',
    'latitude': 32.42417,
    'longitude': 130.01278
},
'43403010': {
    'prefecture': 'Kumamoto',
    'location': 'Oozumachihikimizu',
    'latitude': 32.87611,
    'longitude': 130.87722
},
'43443010': {
    'prefecture': 'Kumamoto',
    'location': 'Mashikimachi_yakuba',
    'latitude': 32.78722,
    'longitude': 130.82056
},
'43444010': {
    'prefecture': 'Kumamoto',
    'location': 'Kousamachiiwashita',
    'latitude': 32.65278,
    'longitude': 130.80833
},
'43481010': {
    'prefecture': 'Kumamoto',
    'location': 'Kodanoura_kouminkan',
    'latitude': 32.34417,
    'longitude': 130.50639
},
'43530010': {
    'prefecture': 'Kumamoto',
    'location': 'Itsuwateno',
    'latitude': 32.51139,
    'longitude': 130.15278
},
'43531010': {
    'prefecture': 'Kumamoto',
    'location': 'Reihokushiki',
    'latitude': 32.50917,
    'longitude': 130.05583
},
'43531020': {
    'prefecture': 'Kumamoto',
    'location': 'Reihokusakasegawa',
    'latitude': 32.52333,
    'longitude': 130.08583
},
'43531030': {
    'prefecture': 'Kumamoto',
    'location': 'Reihokutororo',
    'latitude': 32.46889,
    'longitude': 130.04
},
'43531040': {
    'prefecture': 'Kumamoto',
    'location': 'Reihokukoba',
    'latitude': 32.44889,
    'longitude': 130.07944
},
'43532010': {
    'prefecture': 'Kumamoto',
    'location': 'Amakusa_Takahama',
    'latitude': 32.36806,
    'longitude': 129.99917
},
'44201010': {
    'prefecture': 'Oita',
    'location': 'Shikidosyougakkou_Sokuteikyoku',
    'latitude': 33.18694,
    'longitude': 131.62611
},
'44201050': {
    'prefecture': 'Oita',
    'location': 'Minami-Ooita_shougakkou',
    'latitude': 33.215,
    'longitude': 131.59472
},
'44201070': {
    'prefecture': 'Oita',
    'location': 'Misa_shougakkou',
    'latitude': 33.25056,
    'longitude': 131.68472
},
'44201080': {
    'prefecture': 'Oita',
    'location': 'Oozai_shougakkou',
    'latitude': 33.24417,
    'longitude': 131.72139
},
'44201090': {
    'prefecture': 'Oita',
    'location': 'Sakanoichi_chuugakkou',
    'latitude': 33.225,
    'longitude': 131.75333
},
'44201100': {
    'prefecture': 'Oita',
    'location': 'Hetsugi_chuugakkou',
    'latitude': 33.1525,
    'longitude': 131.66056
},
'44201130': {
    'prefecture': 'Oita',
    'location': 'Higashi-Ooita_shougakkou',
    'latitude': 33.24028,
    'longitude': 131.64167
},
'44201340': {
    'prefecture': 'Oita',
    'location': 'Nyuu_shougakkou',
    'latitude': 33.21139,
    'longitude': 131.72528
},
'44201350': {
    'prefecture': 'Oita',
    'location': 'Seibu_seisoujigyousho',
    'latitude': 33.18556,
    'longitude': 131.55389
},
'44201360': {
    'prefecture': 'Oita',
    'location': 'Daitou_chuugakkou',
    'latitude': 33.20722,
    'longitude': 131.68028
},
'44201370': {
    'prefecture': 'Oita',
    'location': 'Ooji_chuugakkou',
    'latitude': 33.23167,
    'longitude': 131.59556
},
'44201510': {
    'prefecture': 'Oita',
    'location': 'Chuuou_sokuteikyoku',
    'latitude': 33.23167,
    'longitude': 131.61028
},
'44201520': {
    'prefecture': 'Oita',
    'location': 'Miyazakisokuteikyoku',
    'latitude': 33.19611,
    'longitude': 131.60972
},
'44202020': {
    'prefecture': 'Oita',
    'location': 'Aoyamatyuugakkou',
    'latitude': 33.285,
    'longitude': 131.48694
},
'44203070': {
    'prefecture': 'Oita',
    'location': 'hokubusinkoukyokunakatsujimusyo',
    'latitude': 33.58917,
    'longitude': 131.19722
},
'44204010': {
    'prefecture': 'Oita',
    'location': 'seibusinkoukyoku',
    'latitude': 33.31667,
    'longitude': 130.93333
},
'44205020': {
    'prefecture': 'Oita',
    'location': 'nanbusinkoukyoku',
    'latitude': 32.96139,
    'longitude': 131.91056
},
'44206010': {
    'prefecture': 'Oita',
    'location': 'Usukishiyakusyo',
    'latitude': 33.12306,
    'longitude': 131.8075
},
'44207010': {
    'prefecture': 'Oita',
    'location': 'Tsukumishiyakusyo',
    'latitude': 33.06917,
    'longitude': 131.86333
},
'44212010': {
    'prefecture': 'Oia',
    'location': 'Houhihokenjo',
    'latitude': 32.9725,
    'longitude': 131.58056
},
'44213010': {
    'prefecture': 'Oita',
    'location': 'YUHU　health center',
    'latitude': 33.17944,
    'longitude': 131.42639
},
'44214010': {
    'prefecture': 'Oita',
    'location': 'KUNISAKI　highschool',
    'latitude': 33.5575,
    'longitude': 131.73167
},
'44341020': {
    'prefecture': 'Oita',
    'location': 'Hijimachitakajyou',
    'latitude': 33.36556,
    'longitude': 131.53083
},
'44381010': {
    'prefecture': 'Oita',
    'location': 'Saganosekishisho',
    'latitude': 33.24361,
    'longitude': 131.87861
},
'45201040': {
    'prefecture': 'Miyazaki',
    'location': 'sadowara',
    'latitude': 32.02417,
    'longitude': 131.47389
},
'45201050': {
    'prefecture': 'Miyazaki',
    'location': 'gion',
    'latitude': 31.93278,
    'longitude': 131.41083
},
'45201060': {
    'prefecture': 'Miyazaki',
    'location': 'tano',
    'latitude': 31.83889,
    'longitude': 131.30111
},
'45201520': {
    'prefecture': 'Miyazaki',
    'location': 'Minami-Miyazaki_jihaikyoku',
    'latitude': 31.89444,
    'longitude': 131.42056
},
'45201530': {
    'prefecture': 'Miyazaki',
    'location': 'Ikimesyougakkoujihaikyoku',
    'latitude': 31.93111,
    'longitude': 131.37056
},
'45201540': {
    'prefecture': 'Miyaaki',
    'location': 'OHMIYASYOJIHAIKYOKU',
    'latitude': 31.94417,
    'longitude': 131.42917
},
'45202020': {
    'prefecture': 'Miyazaki',
    'location': 'Miyakonojou_kousen',
    'latitude': 31.75694,
    'longitude': 131.08222
},
'45202510': {
    'prefecture': 'Miyazaki',
    'location': 'Miyakonojou_jihaikyoku',
    'latitude': 31.7175,
    'longitude': 131.07083
},
'45203020': {
    'prefecture': 'Miyazaki',
    'location': 'Nobeoka_shougyoukoukou',
    'latitude': 32.61361,
    'longitude': 131.67111
},
'45203050': {
    'prefecture': 'Miyazaki',
    'location': 'Higashi_shougakkou',
    'latitude': 32.56972,
    'longitude': 131.6875
},
'45203070': {
    'prefecture': 'Miyazaki',
    'location': 'Nobeoka_shokubutsuen',
    'latitude': 32.56917,
    'longitude': 131.61556
},
'45203090': {
    'prefecture': 'Miyazaki',
    'location': 'nobeokaseihoukoukou',
    'latitude': 32.5475,
    'longitude': 131.67667
},
'45203100': {
    'prefecture': 'Miyazaki',
    'location': 'Nobeoka_hokenjo',
    'latitude': 32.57583,
    'longitude': 131.65722
},
'45203520': {
    'prefecture': 'Miyazaki',
    'location': 'Shin-Nobeoka_jihaikyoku',
    'latitude': 32.57083,
    'longitude': 131.675
},
'45204010': {
    'prefecture': 'Miyazaki',
    'location': 'Nichinan_hokenjo',
    'latitude': 31.60333,
    'longitude': 131.3775
},
'45204030': {
    'prefecture': 'Miyazaki',
    'location': 'Aburatsu_shougakkou',
    'latitude': 31.58833,
    'longitude': 131.40389
},
'45205010': {
    'prefecture': 'Miyazaki',
    'location': 'kobayasihokensyosokuteikyoku',
    'latitude': 31.98111,
    'longitude': 130.99778
},
'45206020': {
    'prefecture': 'Miyazaki',
    'location': 'Daioudani_shougakkou',
    'latitude': 32.435,
    'longitude': 131.63778
},
'45206030': {
    'prefecture': 'Miyazaki',
    'location': 'hyuugasiritsutosyokan',
    'latitude': 32.42,
    'longitude': 131.62556
},
'45206080': {
    'prefecture': 'Miyazaki',
    'location': 'Hososhima_kouminkan',
    'latitude': 32.42167,
    'longitude': 131.66222
},
'45401010': {
    'prefecture': 'Miyazaki',
    'location': 'takanabetyoukenkoudukurisenta-',
    'latitude': 32.12722,
    'longitude': 131.50861
},
'45403010': {
    'prefecture': 'Miyazaki',
    'location': 'nishimerasonkenkouzoushinhiroba',
    'latitude': 32.22944,
    'longitude': 131.14528
},
'45421040': {
    'prefecture': 'Miyazaki',
    'location': 'Kadogawa_chou',
    'latitude': 32.46889,
    'longitude': 131.63472
},
'45441010': {
    'prefecture': 'Miyazaki',
    'location': 'takachihohokensyo',
    'latitude': 32.70556,
    'longitude': 131.30528
},
'46201010': {
    'prefecture': 'Kagoshima',
    'location': 'Kagoshimasiyakusyo',
    'latitude': 31.59611,
    'longitude': 130.55722
},
'46201130': {
    'prefecture': 'Kagoshima',
    'location': 'Taniyamashisyo',
    'latitude': 31.52139,
    'longitude': 130.51778
},
'46201220': {
    'prefecture': 'Kagoshima',
    'location': 'Arimura',
    'latitude': 31.5575,
    'longitude': 130.66583
},
'46201260': {
    'prefecture': 'Kagoshima',
    'location': 'Kurokami',
    'latitude': 31.59222,
    'longitude': 130.70778
},
'46201270': {
    'prefecture': 'Kagoshima',
    'location': 'Kankyouhokensenta',
    'latitude': 31.58167,
    'longitude': 130.56667
},
'46201520': {
    'prefecture': 'Kagoshima',
    'location': 'Kamoike',
    'latitude': 31.56389,
    'longitude': 130.55444
},
'46202010': {
    'prefecture': 'Kagoshima',
    'location': 'Sendai_hokenjo',
    'latitude': 31.82389,
    'longitude': 130.30889
},
'46202040': {
    'prefecture': 'Kagoshima',
    'location': 'Yorita',
    'latitude': 31.81111,
    'longitude': 130.18417
},
'46202200': {
    'prefecture': 'Kagoshima',
    'location': 'KANKYOUHOUSHASENKANSHISENTA-',
    'latitude': 31.81056,
    'longitude': 130.30556
},
'46202520': {
    'prefecture': 'Kagoshima',
    'location': 'SATSUMASENDAI',
    'latitude': 31.82917,
    'longitude': 130.29583
},
'46203010': {
    'prefecture': 'Kagoshima',
    'location': 'Kanoya',
    'latitude': 31.3725,
    'longitude': 130.85417
},
'46205010': {
    'prefecture': 'Kagoshima',
    'location': 'Hashima',
    'latitude': 31.75528,
    'longitude': 130.20417
},
'46208010': {
    'prefecture': 'Kagoshima',
    'location': 'ＩＺＵＭＩ',
    'latitude': 32.08889,
    'longitude': 130.35139
},
'46212010': {
    'prefecture': 'Kagoshima',
    'location': 'Kirishima',
    'latitude': 31.73333,
    'longitude': 130.76278
},
'46220010': {
    'prefecture': 'Kagoshima',
    'location': 'Minamisatsuma',
    'latitude': 31.41667,
    'longitude': 130.3225
},
'46302010': {
    'prefecture': 'Kagoshima',
    'location': 'Sakurajimashisyo',
    'latitude': 31.61361,
    'longitude': 130.63778
},
'46302020': {
    'prefecture': 'Kagoshima',
    'location': 'Akamizu',
    'latitude': 31.56611,
    'longitude': 130.61583
},
'46321010': {
    'prefecture': 'Kagoshima',
    'location': 'Kiiretyou',
    'latitude': 31.3725,
    'longitude': 130.54472
},
'46466010': {
    'prefecture': 'Kagoshima',
    'location': 'Shibushi',
    'latitude': 31.46889,
    'longitude': 131.10111
},
'46482010': {
    'prefecture': 'Kagoshima',
    'location': 'HIGASHIKUSHIRA',
    'latitude': 31.35861,
    'longitude': 131.00167
},
'47201140': {
    'prefecture': 'okinawa',
    'location': 'Naha',
    'latitude': 26.20639,
    'longitude': 127.69417
},
'47201580': {
    'prefecture': 'okinawa',
    'location': 'MATSUO',
    'latitude': 26.21556,
    'longitude': 127.68528
},
'47206020': {
    'prefecture': 'okinawa',
    'location': 'Taira',
    'latitude': 24.80306,
    'longitude': 125.2875
},
'47207020': {
    'prefecture': 'okinawa',
    'location': 'Ishigaki',
    'latitude': 24.34028,
    'longitude': 124.155
},
'47208510': {
    'prefecture': 'okinawa',
    'location': 'Makiminato',
    'latitude': 26.26667,
    'longitude': 127.72389
},
'47209080': {
    'prefecture': 'okinawa',
    'location': 'Nago',
    'latitude': 26.58917,
    'longitude': 127.98944
},
'47210060': {
    'prefecture': 'okinawa',
    'location': 'Itoman',
    'latitude': 26.14611,
    'longitude': 127.66556
},
'47211050': {
    'prefecture': 'okinawa',
    'location': 'Okinawa',
    'latitude': 26.35889,
    'longitude': 127.81389
},
'47301950': {
    'prefecture': 'okinawa',
    'location': 'Kokusetsu_Hedo_Cape',
    'latitude': 26.86611,
    'longitude': 128.24861
},
'47322010': {
    'prefecture': 'okinawa',
    'location': 'Yonashiro',
    'latitude': 26.35583,
    'longitude': 127.97167
},
'47329010': {
    'prefecture': 'okinawa',
    'location': 'Nishihara',
    'latitude': 26.22583,
    'longitude': 127.76528
},
'0Air quality measurement station  Coordinates': {
    'latitude': null,
    'longitude': null
},
'0code': {
    'prefecture': 'pref(EG)',
    'location': 'Measuring station (EG)',
    'latitude': null,
    'longitude': null
},
'01101010': {
    'prefecture': 'Hokkaido',
    'location': 'Senta',
    'latitude': 43.06222,
    'longitude': 141.35417
},
'01101090': {
    'prefecture': 'Hokkaido',
    'location': 'Fushimi',
    'latitude': 43.03556,
    'longitude': 141.33722
},
'01101520': {
    'prefecture': 'Hokkaido',
    'location': 'kitaichijou',
    'latitude': 43.06222,
    'longitude': 141.35389
},
'01101540': {
    'prefecture': 'Hokkaido',
    'location': 'Minamijuyonjou',
    'latitude': 43.04111,
    'longitude': 141.34389
},
'01102010': {
    'prefecture': 'Hokkaido',
    'location': 'Sinoro',
    'latitude': 43.14694,
    'longitude': 141.37139
},
'01103010': {
    'prefecture': 'Hokkaido',
    'location': 'Higashi',
    'latitude': 43.08361,
    'longitude': 141.35833
},
'01103520': {
    'prefecture': 'Hokkaido',
    'location': 'Higashi18c',
    'latitude': 43.10417,
    'longitude': 141.37361
},
'01104030': {
    'prefecture': 'Hokkaido',
    'location': 'Kitasiraishi',
    'latitude': 43.06861,
    'longitude': 141.41444
},
'01105010': {
    'prefecture': 'Hokkaido',
    'location': 'Higashigassamu',
    'latitude': 43.02389,
    'longitude': 141.4275
},
'01105520': {
    'prefecture': 'Hokkaido',
    'location': 'Gassamutyuo',
    'latitude': 43.03167,
    'longitude': 141.39583
},
'01107020': {
    'prefecture': 'Hokkaido',
    'location': 'Hssamu',
    'latitude': 43.08861,
    'longitude': 141.28583
},
'01107030': {
    'prefecture': 'Hokkaido',
    'location': 'Teine',
    'latitude': 43.12333,
    'longitude': 141.245
},
'01108010': {
    'prefecture': 'Hokkaido',
    'location': 'Atsubetu',
    'latitude': 43.04194,
    'longitude': 141.46472
},
'01213020': {
    'prefecture': 'Hokkaido',
    'location': 'Futaba',
    'latitude': 42.64806,
    'longitude': 141.61139
},
'01213050': {
    'prefecture': 'Hokkaido',
    'location': 'Akenokouen',
    'latitude': 42.65889,
    'longitude': 141.63167
},
'01213070': {
    'prefecture': 'Hokkaido',
    'location': 'Yuufutsu',
    'latitude': 42.62639,
    'longitude': 141.72778
},
'01213110': {
    'prefecture': 'Hokkaido',
    'location': 'Misawa',
    'latitude': 42.75056,
    'longitude': 141.73861
},
'01213510': {
    'prefecture': 'Hokkaido',
    'location': 'Itoi',
    'latitude': 42.62694,
    'longitude': 141.54083
},
'01213220': {
    'prefecture': 'Hokkaido',
    'location': 'Numanohata',
    'latitude': 42.66778,
    'longitude': 141.69194
},
'01224010': {
    'prefecture': 'Hokkaido',
    'location': 'Hinode',
    'latitude': 42.8275,
    'longitude': 141.67611
},
'01224020': {
    'prefecture': 'Hokkaido',
    'location': 'Tomioka',
    'latitude': 42.83694,
    'longitude': 141.64722
},
'01224050': {
    'prefecture': 'Hokkaido',
    'location': 'Komasato',
    'latitude': 42.79472,
    'longitude': 141.73806
},
'01224060': {
    'prefecture': 'Hokkaido',
    'location': 'Wakakusa',
    'latitude': 42.78694,
    'longitude': 141.605
},
'01224510': {
    'prefecture': 'Hokkaido',
    'location': 'Kawaminami',
    'latitude': 42.82194,
    'longitude': 141.65806
},
'01578010': {
    'prefecture': 'Hokkaido',
    'location': 'Shiraoi',
    'latitude': 42.54833,
    'longitude': 141.35917
},
'01579020': {
    'prefecture': 'Hokkaido',
    'location': 'Touasa',
    'latitude': 42.74361,
    'longitude': 141.76472
},
'01581010': {
    'prefecture': 'Hokkaido',
    'location': 'Atsuma',
    'latitude': 42.71889,
    'longitude': 141.88833
},
'01581020': {
    'prefecture': 'Hokkaido',
    'location': 'Kamiatusma',
    'latitude': 42.6425,
    'longitude': 141.85333
},
'01582020': {
    'prefecture': 'Hokkaido',
    'location': 'Taura',
    'latitude': 42.59556,
    'longitude': 141.915
},
'01582030': {
    'prefecture': 'Hokkaido',
    'location': 'Mukawa',
    'latitude': 42.57639,
    'longitude': 141.92972
},
'01579030': {
    'prefecture': 'Hokkaido',
    'location': 'Hayakita',
    'latitude': 42.75528,
    'longitude': 141.80194
},
'01578030': {
    'prefecture': 'Hokkaido',
    'location': 'Kitayoshihara',
    'latitude': 42.51,
    'longitude': 141.3
},
'01102510': {
    'prefecture': 'Hokkaido',
    'location': 'kita19jyou',
    'latitude': 43.08444,
    'longitude': 141.34917
},
'01101020': {
    'prefecture': 'Hokkaido',
    'location': 'yamahana',
    'latitude': 43.02861,
    'longitude': 141.34028
},
'01302010': {
    'prefecture': 'Hokkaido',
    'location': 'tarukawa',
    'latitude': 43.15778,
    'longitude': 141.28361
},
'01226010': {
    'prefecture': 'Hokkaido',
    'location': 'syokugyoukunrenkou',
    'latitude': 43.50972,
    'longitude': 141.91861
},
'01424010': {
    'prefecture': 'Hokkaido',
    'location': 'naie',
    'latitude': 43.42667,
    'longitude': 141.875
},
'01518950': {
    'prefecture': 'Hokkaido',
    'location': 'Kokusetsu_Rishiri',
    'latitude': 45.11972,
    'longitude': 141.20917
},
'01204010': {
    'prefecture': 'Hokkaido',
    'location': 'chuo',
    'latitude': 43.77028,
    'longitude': 142.36472
},
'01204011': {
    'prefecture': 'Hokkaido',
    'location': 'chuo',
    'latitude': 43.77028,
    'longitude': 142.36472
},
'01204050': {
    'prefecture': 'Hokkaido',
    'location': 'hokumon',
    'latitude': 43.79444,
    'longitude': 142.33056
},
'01204150': {
    'prefecture': 'Hokkaido',
    'location': 'toko',
    'latitude': 43.74722,
    'longitude': 142.39611
},
'01204160': {
    'prefecture': 'Hokkaido',
    'location': 'nagayama',
    'latitude': 43.81028,
    'longitude': 142.43667
},
'01213610': {
    'prefecture': 'Hokkaido',
    'location': 'Shiyakusho',
    'latitude': 42.63444,
    'longitude': 141.60444
},
'01202080': {
    'prefecture': 'Hokkaido',
    'location': 'Kameda_chugakkou',
    'latitude': 41.81889,
    'longitude': 140.74694
},
'01202100': {
    'prefecture': 'Hokkaido',
    'location': 'Chuubu_syougakkou',
    'latitude': 41.77833,
    'longitude': 140.73556
},
'01202110': {
    'prefecture': 'Hokkaido',
    'location': 'Mannenbashi_shougakkou',
    'latitude': 41.79583,
    'longitude': 140.73083
},
'01202560': {
    'prefecture': 'Hokkaido',
    'location': 'Mihara',
    'latitude': 41.81861,
    'longitude': 140.74611
},
'01202570': {
    'prefecture': 'Hokkaido',
    'location': 'Komaba',
    'latitude': 41.78278,
    'longitude': 140.7675
},
'01205020': {
    'prefecture': 'Hokkaido',
    'location': 'Gozensui',
    'latitude': 42.3225,
    'longitude': 140.99778
},
'01205310': {
    'prefecture': 'Hokkaido',
    'location': 'Wanishi ',
    'latitude': 42.33667,
    'longitude': 141.01611
},
'01205540': {
    'prefecture': 'Hokkaido',
    'location': 'Shiomi',
    'latitude': 42.34194,
    'longitude': 141.02722
},
'01205320': {
    'prefecture': 'Hokkaido',
    'location': 'Higashi',
    'latitude': 42.3475,
    'longitude': 141.03111
},
'01205550': {
    'prefecture': 'Hokkaido',
    'location': 'Jinya',
    'latitude': 42.36639,
    'longitude': 140.95028
},
'01205060': {
    'prefecture': 'Hokkaido',
    'location': 'Hakuchodai',
    'latitude': 42.37417,
    'longitude': 140.94194
},
'01203090': {
    'prefecture': 'Hokkaido',
    'location': 'zenibako',
    'latitude': 43.13944,
    'longitude': 141.15611
},
'01203100': {
    'prefecture': 'Hokkaido',
    'location': 'katsunai',
    'latitude': 43.18194,
    'longitude': 141.02194
},
'01203110': {
    'prefecture': 'Hokkaido',
    'location': 'shioya',
    'latitude': 43.21056,
    'longitude': 140.93694
},
'01203520': {
    'prefecture': 'Hokkaido',
    'location': 'ekimaekousaten',
    'latitude': 43.19667,
    'longitude': 140.99472
},
'01335030': {
    'prefecture': 'Hokkaido',
    'location': 'oiwake',
    'latitude': 41.82556,
    'longitude': 140.69806
},
'01206290': {
    'prefecture': 'Hokkaido',
    'location': 'shouwashougakkou',
    'latitude': 43.02111,
    'longitude': 144.36389
},
'01102020': {
    'prefecture': 'Hokkaido',
    'location': 'Kokusetsu_Sapporo',
    'latitude': 43.08167,
    'longitude': 141.33333
},
'01208510': {
    'prefecture': 'Hokkaido',
    'location': 'TOKIWATYOUSOKUTEIKYOKU',
    'latitude': 43.79806,
    'longitude': 143.88972
},
'01207090': {
    'prefecture': 'Hokkaido',
    'location': 'obihiroshiyakusyo',
    'latitude': 42.92389,
    'longitude': 143.19583
},
'01206280': {
    'prefecture': 'Hokkaido',
    'location': 'kushirokousen',
    'latitude': 43.01694,
    'longitude': 144.26278
},
'01106050': {
    'prefecture': 'Hokkaido',
    'location': 'komaoka',
    'latitude': 42.96306,
    'longitude': 141.35389
},
'01110010': {
    'prefecture': 'Hokkaido',
    'location': 'kiyota',
    'latitude': 42.99944,
    'longitude': 141.44389
},
'02201070': {
    'prefecture': 'Aomori',
    'location': 'Tsutsumishougakkou',
    'latitude': 40.80917,
    'longitude': 140.91944
},
'02203050': {
    'prefecture': 'Aomori',
    'location': 'Negishisyougakkou',
    'latitude': 40.53972,
    'longitude': 141.48889
},
'02203220': {
    'prefecture': 'Aomori',
    'location': 'Kikyounosyougakkou',
    'latitude': 40.55722,
    'longitude': 141.45167
},
'02203240': {
    'prefecture': 'Aomori',
    'location': 'Hachinohesyougakkou',
    'latitude': 40.51306,
    'longitude': 141.48111
},
'02203510': {
    'prefecture': 'Aomori',
    'location': 'Muikamachi',
    'latitude': 40.50667,
    'longitude': 141.49472
},
'02411010': {
    'prefecture': 'Aomori',
    'location': 'Obuchisyougakkou',
    'latitude': 40.96528,
    'longitude': 141.37806
},
'02411020': {
    'prefecture': 'Aomori',
    'location': 'Tokusarisyougakkou',
    'latitude': 40.93528,
    'longitude': 141.29472
},
'02201080': {
    'prefecture': 'Aomori',
    'location': 'Koudashougakkou',
    'latitude': 40.81139,
    'longitude': 140.73694
},
'02202060': {
    'prefecture': 'Aomori',
    'location': 'Hirosakidaiichicyuugakkou',
    'latitude': 40.60611,
    'longitude': 140.48
},
'02202510': {
    'prefecture': 'Aomori',
    'location': 'Bunkyousyougakkou',
    'latitude': 40.58167,
    'longitude': 140.4775
},
'02203250': {
    'prefecture': 'Aomori',
    'location': 'Konakanocyuugakkou',
    'latitude': 40.51361,
    'longitude': 141.51417
},
'02201090': {
    'prefecture': 'Aomori',
    'location': 'Shinnjyoucyuugakkou',
    'latitude': 40.8225,
    'longitude': 140.67806
},
'02204010': {
    'prefecture': 'Aomori',
    'location': 'Supokaruinkuroishi',
    'latitude': 40.64861,
    'longitude': 140.59778
},
'02205010': {
    'prefecture': 'Aomori',
    'location': 'Goshogawaradaisancyuugakkou',
    'latitude': 40.77889,
    'longitude': 140.46833
},
'02364510': {
    'prefecture': 'Aomori',
    'location': 'Daieisyougakkou',
    'latitude': 40.75389,
    'longitude': 140.59389
},
'02206030': {
    'prefecture': 'Aomori',
    'location': 'Sanbongicyuugakkou',
    'latitude': 40.60556,
    'longitude': 141.20611
},
'02207020': {
    'prefecture': 'Aomori',
    'location': 'Okamisawacyounaikaikan',
    'latitude': 40.69139,
    'longitude': 141.38
},
'02208030': {
    'prefecture': 'Aomori',
    'location': 'Tomabusyougakkou',
    'latitude': 41.28194,
    'longitude': 141.21111
},
'02445510': {
    'prefecture': 'Aomori',
    'location': 'Nanbuyouchien',
    'latitude': 40.42167,
    'longitude': 141.31333
},
'02321010': {
    'prefecture': 'Aomori',
    'location': 'AJIGASAWAMACHI MAITO',
    'latitude': 40.78278,
    'longitude': 140.23861
},
'02203260': {
    'prefecture': 'Aomori',
    'location': 'HACHINOHE KISHOUKANSOKUSHO',
    'latitude': 40.5275,
    'longitude': 141.52167
},
'02307950': {
    'prefecture': 'Aomori',
    'location': 'Kokusetsu_Tappi',
    'latitude': 41.25167,
    'longitude': 140.34972
},
'02201520': {
    'prefecture': 'Aomori',
    'location': 'hashimotosyougakkou',
    'latitude': 40.82417,
    'longitude': 140.7525
},
'03201070': {
    'prefecture': 'Iwate',
    'location': 'Tushida',
    'latitude': 39.65444,
    'longitude': 141.15833
},
'03201030': {
    'prefecture': 'Iwate',
    'location': 'Matuochou',
    'latitude': 39.69278,
    'longitude': 141.16361
},
'03201060': {
    'prefecture': 'Iwate',
    'location': 'Aoyama',
    'latitude': 39.72556,
    'longitude': 141.11417
},
'03201510': {
    'prefecture': 'Iwate',
    'location': 'Moriokasiyakusho',
    'latitude': 39.69944,
    'longitude': 141.15639
},
'03201550': {
    'prefecture': 'Iwate',
    'location': 'Ueda',
    'latitude': 39.72028,
    'longitude': 141.13861
},
'03202020': {
    'prefecture': 'Iwate',
    'location': 'Fujiwara',
    'latitude': 39.63444,
    'longitude': 141.96333
},
'03203080': {
    'prefecture': 'Iwate',
    'location': 'Ikawatyou',
    'latitude': 39.09056,
    'longitude': 141.70889
},
'03204010': {
    'prefecture': 'Iwate',
    'location': 'Mizusawa',
    'latitude': 39.14417,
    'longitude': 141.14
},
'03205010': {
    'prefecture': 'Iwate',
    'location': 'Hanashiro',
    'latitude': 39.39,
    'longitude': 141.11583
},
'03206010': {
    'prefecture': 'Iwate',
    'location': 'Yoshityou',
    'latitude': 39.28694,
    'longitude': 141.11139
},
'03206520': {
    'prefecture': 'Iwate',
    'location': 'Oniyanagichou',
    'latitude': 39.27028,
    'longitude': 141.10417
},
'03207010': {
    'prefecture': 'Iwate',
    'location': 'Youkamachi',
    'latitude': 40.19222,
    'longitude': 141.76333
},
'03209010': {
    'prefecture': 'Iwate',
    'location': 'Takeyamamachi',
    'latitude': 38.93583,
    'longitude': 141.12667
},
'03209510': {
    'prefecture': 'Iwate',
    'location': 'Santanda',
    'latitude': 38.93222,
    'longitude': 141.11861
},
'03211070': {
    'prefecture': 'Iwate',
    'location': 'Shinmachi',
    'latitude': 39.26583,
    'longitude': 141.84556
},
'03211510': {
    'prefecture': 'Iwate',
    'location': 'Ureishichou',
    'latitude': 39.26139,
    'longitude': 141.89278
},
'03213010': {
    'prefecture': 'Iwate',
    'location': 'Nakasone',
    'latitude': 40.26972,
    'longitude': 141.29722
},
'03305010': {
    'prefecture': 'Iwate',
    'location': 'Kashi',
    'latitude': 39.78167,
    'longitude': 141.14056
},
'03424020': {
    'prefecture': 'Iwate',
    'location': 'Matsukawa',
    'latitude': 38.9775,
    'longitude': 141.24444
},
'03213020': {
    'prefecture': 'Iwate',
    'location': 'Niwatari',
    'latitude': 40.26861,
    'longitude': 141.29417
},
'03321010': {
    'prefecture': 'Iwate',
    'location': 'HIZUME',
    'latitude': 39.55556,
    'longitude': 141.17222
},
'03215010': {
    'prefecture': 'Iwate',
    'location': 'ESASHI',
    'latitude': 39.19278,
    'longitude': 141.175
},
'03202050': {
    'prefecture': 'Iwate',
    'location': 'Yokomachi',
    'latitude': 39.64417,
    'longitude': 141.94917
},
'03203090': {
    'prefecture': 'Iwate',
    'location': 'Ikawacho',
    'latitude': 39.09528,
    'longitude': 141.70472
},
'04201020': {
    'prefecture': 'Miyagi',
    'location': 'Iwakiri',
    'latitude': 38.29833,
    'longitude': 140.94778
},
'04201030': {
    'prefecture': 'Miyagi',
    'location': 'Tsurugaya',
    'latitude': 38.28778,
    'longitude': 140.91444
},
'04201050': {
    'prefecture': 'Miyagi',
    'location': 'Nagamachi',
    'latitude': 38.21639,
    'longitude': 140.89333
},
'04201060': {
    'prefecture': 'Miyagi',
    'location': 'Nakayama',
    'latitude': 38.29306,
    'longitude': 140.84278
},
'04201070': {
    'prefecture': 'Miyagi',
    'location': 'Nakano',
    'latitude': 38.26472,
    'longitude': 140.97639
},
'04201080': {
    'prefecture': 'Miyagi',
    'location': 'Shichigou',
    'latitude': 38.23778,
    'longitude': 140.94639
},
'04201110': {
    'prefecture': 'Miyagi',
    'location': 'Kokusetsu_Sendai',
    'latitude': 38.26583,
    'longitude': 140.87639
},
'04201210': {
    'prefecture': 'Miyagi',
    'location': 'Fukumuro',
    'latitude': 38.27722,
    'longitude': 140.97389
},
'04201220': {
    'prefecture': 'Miyagi',
    'location': 'Yamada',
    'latitude': 38.21778,
    'longitude': 140.83111
},
'04201230': {
    'prefecture': 'Miyagi',
    'location': 'Tsutsujigaoka',
    'latitude': 38.25667,
    'longitude': 140.90194
},
'04201540': {
    'prefecture': 'Miyagi',
    'location': 'Nigatake',
    'latitude': 38.26444,
    'longitude': 140.91444
},
'04201550': {
    'prefecture': 'Miyagi',
    'location': 'Kimachi',
    'latitude': 38.26806,
    'longitude': 140.86667
},
'04201560': {
    'prefecture': 'Miyagi',
    'location': 'Itsutsubashi',
    'latitude': 38.24806,
    'longitude': 140.88472
},
'04203010': {
    'prefecture': 'Miyagi',
    'location': 'Shiogama',
    'latitude': 38.31194,
    'longitude': 141.02556
},
'04203510': {
    'prefecture': 'Miyagi',
    'location': 'Shiogama_jihai',
    'latitude': 38.31333,
    'longitude': 141.03139
},
'04204020': {
    'prefecture': 'Miyagi',
    'location': 'Furukawa2',
    'latitude': 38.55694,
    'longitude': 140.97861
},
'04204510': {
    'prefecture': 'Miyagi',
    'location': 'Furukawa_jihai',
    'latitude': 38.56833,
    'longitude': 140.98194
},
'04205020': {
    'prefecture': 'Miyagi',
    'location': 'Kesennuma',
    'latitude': 38.9,
    'longitude': 141.57417
},
'04206010': {
    'prefecture': 'Miyagi',
    'location': 'Shiroishi',
    'latitude': 37.99944,
    'longitude': 140.62028
},
'04207510': {
    'prefecture': 'Miyagi',
    'location': 'Natori_jihai',
    'latitude': 38.17111,
    'longitude': 140.89333
},
'04211010': {
    'prefecture': 'Miyagi',
    'location': 'Iwanuma',
    'latitude': 38.10806,
    'longitude': 140.87083
},
'04323010': {
    'prefecture': 'Miyagi',
    'location': 'Shibata',
    'latitude': 38.05528,
    'longitude': 140.76889
},
'04341010': {
    'prefecture': 'Miyagi',
    'location': 'Marumori_taikisokuteikyoku',
    'latitude': 37.85417,
    'longitude': 140.82306
},
'04401010': {
    'prefecture': 'Miyagi',
    'location': 'Matsushima',
    'latitude': 38.38722,
    'longitude': 141.07639
},
'04406010': {
    'prefecture': 'Miyagi',
    'location': 'Rifu',
    'latitude': 38.32611,
    'longitude': 140.98444
},
'04421010': {
    'prefecture': 'Miyagi',
    'location': 'Taiwa',
    'latitude': 38.44361,
    'longitude': 140.89056
},
'04501010': {
    'prefecture': 'Miyagi',
    'location': 'Kokusetsu_Nonodake',
    'latitude': 38.55056,
    'longitude': 141.17556
},
'04521010': {
    'prefecture': 'Miyagi',
    'location': 'Tsukidate',
    'latitude': 38.735,
    'longitude': 141.02083
},
'04541010': {
    'prefecture': 'Miyagi',
    'location': 'Hasama',
    'latitude': 38.68861,
    'longitude': 141.21389
},
'04562020': {
    'prefecture': 'Miyagi',
    'location': 'Yamoto2',
    'latitude': 38.42111,
    'longitude': 141.21917
},
'04210010': {
    'prefecture': 'Miyagi',
    'location': 'Nanakita',
    'latitude': 38.31972,
    'longitude': 140.89583
},
'04105520': {
    'prefecture': 'Miyagi',
    'location': 'choumei',
    'latitude': 38.30694,
    'longitude': 140.84722
},
'04105530': {
    'prefecture': 'Miyagi',
    'location': 'shougen',
    'latitude': 38.33417,
    'longitude': 140.88972
},
'04101010': {
    'prefecture': 'Miyagi',
    'location': 'Hirose',
    'latitude': 38.27111,
    'longitude': 140.78194
},
'04362010': {
    'prefecture': 'Miyazaki',
    'location': 'Yamamoto',
    'latitude': 37.93667,
    'longitude': 140.895
},
'04101510': {
    'prefecture': 'Miyagi',
    'location': 'Kitane',
    'latitude': 38.29028,
    'longitude': 140.87639
},
'04101020': {
    'prefecture': 'Miyagi',
    'location': 'miyasoukyoku',
    'latitude': 38.26861,
    'longitude': 140.76389
},
'04104010': {
    'prefecture': 'Miyagi',
    'location': 'akisoukyoku',
    'latitude': 38.25917,
    'longitude': 140.67111
},
'04202060': {
    'prefecture': 'Miyagi ',
    'location': 'Ishinomakinishi',
    'latitude': 38.72389,
    'longitude': 141.44139
},
'05201010': {
    'prefecture': 'Akita',
    'location': 'Syougunno',
    'latitude': 39.76083,
    'longitude': 140.08472
},
'05201030': {
    'prefecture': 'Akita',
    'location': 'Barajima',
    'latitude': 39.7,
    'longitude': 140.10722
},
'05201040': {
    'prefecture': 'Akita',
    'location': 'Niida',
    'latitude': 39.6775,
    'longitude': 140.13444
},
'05201060': {
    'prefecture': 'Akita',
    'location': 'Kamishinjyou',
    'latitude': 39.79194,
    'longitude': 140.12528
},
'05201080': {
    'prefecture': 'Akita',
    'location': 'Tsuchizaki',
    'latitude': 39.75444,
    'longitude': 140.07
},
'05201120': {
    'prefecture': 'Akita',
    'location': 'Sannou',
    'latitude': 39.71778,
    'longitude': 140.10583
},
'05201130': {
    'prefecture': 'Akita',
    'location': 'Araya',
    'latitude': 39.67444,
    'longitude': 140.08806
},
'05201340': {
    'prefecture': 'Akita',
    'location': 'Horikawa',
    'latitude': 39.78722,
    'longitude': 140.06583
},
'05201370': {
    'prefecture': 'Akita',
    'location': 'Hiroomote',
    'latitude': 39.70972,
    'longitude': 140.14278
},
'05201530': {
    'prefecture': 'Akita',
    'location': 'Jihaibarajima',
    'latitude': 39.7,
    'longitude': 140.10722
},
'05202020': {
    'prefecture': 'Akita',
    'location': 'Noshironishi',
    'latitude': 40.20722,
    'longitude': 140.02194
},
'05202040': {
    'prefecture': 'Akita',
    'location': 'Hiyama',
    'latitude': 40.1675,
    'longitude': 140.12167
},
'05203020': {
    'prefecture': 'Akita',
    'location': 'Yokote',
    'latitude': 39.30722,
    'longitude': 140.57972
},
'05203520': {
    'prefecture': 'Akita',
    'location': 'Yokotejihai',
    'latitude': 39.30278,
    'longitude': 140.56056
},
'05204020': {
    'prefecture': 'Akita',
    'location': 'Oodate',
    'latitude': 40.26889,
    'longitude': 140.57722
},
'05205010': {
    'prefecture': 'Akita',
    'location': 'Honjyou',
    'latitude': 39.38,
    'longitude': 140.0575
},
'05206060': {
    'prefecture': 'Akita',
    'location': 'Funekawa',
    'latitude': 39.885,
    'longitude': 139.85167
},
'05208010': {
    'prefecture': 'Akita',
    'location': 'Oomagari',
    'latitude': 39.44778,
    'longitude': 140.48278
},
'05362010': {
    'prefecture': 'Akita',
    'location': 'Syouwa',
    'latitude': 39.86722,
    'longitude': 140.06944
},
'06201090': {
    'prefecture': 'Yamagata',
    'location': 'Yamagata_Doumachi',
    'latitude': 38.26778,
    'longitude': 140.34444
},
'06201100': {
    'prefecture': 'Yamagata',
    'location': 'Yamagata_Iida',
    'latitude': 38.21389,
    'longitude': 140.32306
},
'06201510': {
    'prefecture': 'Yamagata',
    'location': 'Yamagata_Shimoyanbe',
    'latitude': 38.26639,
    'longitude': 140.36528
},
'06202010': {
    'prefecture': 'Yamagata',
    'location': 'Yonezawa_Kanaike',
    'latitude': 37.91667,
    'longitude': 140.11694
},
'06203010': {
    'prefecture': 'Yamagata',
    'location': 'turuokanisikimati',
    'latitude': 38.73917,
    'longitude': 139.82694
},
'06204020': {
    'prefecture': 'Yamagata',
    'location': 'Sakata_hikarigaoka',
    'latitude': 38.92806,
    'longitude': 139.83667
},
'06204040': {
    'prefecture': 'Yamagata',
    'location': 'Sakata_Ueda',
    'latitude': 38.94611,
    'longitude': 139.89806
},
'06204050': {
    'prefecture': 'Yamagata',
    'location': 'Sakata_Wakahama',
    'latitude': 38.91083,
    'longitude': 139.85222
},
'06205010': {
    'prefecture': 'Yamagata',
    'location': 'Shinjo_Shimoda',
    'latitude': 38.75417,
    'longitude': 140.30194
},
'06207010': {
    'prefecture': 'Yamagata',
    'location': 'Kaminoyamamoto_jounai',
    'latitude': 38.15444,
    'longitude': 140.28028
},
'06210010': {
    'prefecture': 'Yamagata',
    'location': 'Tendou_Oinomori',
    'latitude': 38.35972,
    'longitude': 140.37944
},
'06422010': {
    'prefecture': 'Yamagata',
    'location': 'Amarume',
    'latitude': 38.84389,
    'longitude': 139.90639
},
'06461010': {
    'prefecture': 'Yamagata',
    'location': 'Yuza',
    'latitude': 39.01056,
    'longitude': 139.91944
},
'06206010': {
    'prefecture': 'Yamagata',
    'location': 'Sagae_nishine',
    'latitude': 38.39083,
    'longitude': 140.2775
},
'06208010': {
    'prefecture': 'Yamagata',
    'location': 'murayama_tateokafueda',
    'latitude': 38.47361,
    'longitude': 140.39917
},
'06209010': {
    'prefecture': 'Yamagata',
    'location': 'nagai_kouya',
    'latitude': 38.11083,
    'longitude': 140.03444
},
'07201180': {
    'prefecture': 'Fukushima',
    'location': 'Furukawa',
    'latitude': 37.77333,
    'longitude': 140.49361
},
'07201190': {
    'prefecture': 'Fukushima',
    'location': 'Minamimachi',
    'latitude': 37.73778,
    'longitude': 140.4675
},
'07201200': {
    'prefecture': 'Fukushima',
    'location': 'Moriai',
    'latitude': 37.76417,
    'longitude': 140.45111
},
'07202070': {
    'prefecture': 'Fukushima',
    'location': 'Aiduwakamatsu',
    'latitude': 37.49139,
    'longitude': 139.92722
},
'07203130': {
    'prefecture': 'Fukushima',
    'location': 'Haga',
    'latitude': 37.38806,
    'longitude': 140.39917
},
'07203140': {
    'prefecture': 'Fukushima',
    'location': 'Tsutsumishita',
    'latitude': 37.38778,
    'longitude': 140.3825
},
'07203150': {
    'prefecture': 'Fukushima',
    'location': 'Hiwada',
    'latitude': 37.44472,
    'longitude': 140.39639
},
'07203170': {
    'prefecture': 'Fukushima',
    'location': 'Fukuyama',
    'latitude': 37.41111,
    'longitude': 140.39444
},
'07203180': {
    'prefecture': 'Fukushima',
    'location': 'Asaka',
    'latitude': 37.35361,
    'longitude': 140.3675
},
'07203520': {
    'prefecture': 'Fukushima',
    'location': 'Daishin',
    'latitude': 37.39,
    'longitude': 140.34361
},
'07204020': {
    'prefecture': 'Fukushima',
    'location': 'Kaminakada',
    'latitude': 36.89111,
    'longitude': 140.78472
},
'07204030': {
    'prefecture': 'Fukushima',
    'location': 'Hananoi',
    'latitude': 36.90778,
    'longitude': 140.77833
},
'07204070': {
    'prefecture': 'Fukushima',
    'location': 'Shimogawa',
    'latitude': 36.93333,
    'longitude': 140.86611
},
'07204090': {
    'prefecture': 'Fukushima',
    'location': 'Takijiri',
    'latitude': 36.94972,
    'longitude': 140.87194
},
'07204110': {
    'prefecture': 'Fukushima',
    'location': 'Ohara',
    'latitude': 36.96,
    'longitude': 140.89472
},
'07204160': {
    'prefecture': 'Fukushima',
    'location': 'Nakahara',
    'latitude': 36.94361,
    'longitude': 140.88222
},
'07204170': {
    'prefecture': 'Fukushima',
    'location': 'Kanayama',
    'latitude': 36.92583,
    'longitude': 140.825
},
'07204210': {
    'prefecture': 'Fukushima',
    'location': 'Agetsuchi',
    'latitude': 37.05556,
    'longitude': 140.88889
},
'07204510': {
    'prefecture': 'Fukushima',
    'location': 'Taira',
    'latitude': 37.05139,
    'longitude': 140.89722
},
'07205050': {
    'prefecture': 'Fukushima',
    'location': 'Shirakawa',
    'latitude': 37.12389,
    'longitude': 140.205
},
'07206050': {
    'prefecture': 'Fukushima',
    'location': 'Haramachi1',
    'latitude': 37.63694,
    'longitude': 140.95389
},
'07206060': {
    'prefecture': 'Fukushima',
    'location': 'Haramachi2',
    'latitude': 37.59472,
    'longitude': 140.96361
},
'07207010': {
    'prefecture': 'Fukushima',
    'location': 'Sukagawa',
    'latitude': 37.28417,
    'longitude': 140.37556
},
'07209080': {
    'prefecture': 'Fukushima',
    'location': 'Souma1',
    'latitude': 37.80139,
    'longitude': 140.92333
},
'07209090': {
    'prefecture': 'Fukushima',
    'location': 'Souma2',
    'latitude': 37.76472,
    'longitude': 140.94889
},
'07407020': {
    'prefecture': 'Fukushima',
    'location': 'Ooderarokku',
    'latitude': 37.55278,
    'longitude': 139.98639
},
'07541010': {
    'prefecture': 'Fukushima',
    'location': 'Hirono1',
    'latitude': 37.21333,
    'longitude': 140.99667
},
'07541020': {
    'prefecture': 'Fukushima',
    'location': 'Hirono2',
    'latitude': 37.20944,
    'longitude': 140.96028
},
'07542010': {
    'prefecture': 'Fukushima',
    'location': 'Naraha',
    'latitude': 37.26278,
    'longitude': 140.99306
},
'07543010': {
    'prefecture': 'Fukushima',
    'location': 'Tomioka',
    'latitude': 37.35583,
    'longitude': 140.99722
},
'07545010': {
    'prefecture': 'Fukushima',
    'location': 'Ookuma',
    'latitude': 37.40083,
    'longitude': 140.9925
},
'07546010': {
    'prefecture': 'Fukushima',
    'location': 'Futaba',
    'latitude': 37.43833,
    'longitude': 141.00917
},
'07547010': {
    'prefecture': 'Fukushima',
    'location': 'Namie',
    'latitude': 37.49,
    'longitude': 140.98361
},
'07561020': {
    'prefecture': 'Fukushima',
    'location': 'Shinchi1',
    'latitude': 37.87056,
    'longitude': 140.9175
},
'07561030': {
    'prefecture': 'Fukushima',
    'location': 'Shinchi2',
    'latitude': 37.87167,
    'longitude': 140.88361
},
'07562010': {
    'prefecture': 'Fukushima',
    'location': 'Kashima_terauchi',
    'latitude': 37.70278,
    'longitude': 140.95806
},
'07563010': {
    'prefecture': 'Fukushima',
    'location': 'Odaka',
    'latitude': 37.56194,
    'longitude': 140.99722
},
'07210010': {
    'prefecture': 'Fukushima',
    'location': 'Nihonmatsu',
    'latitude': 37.58194,
    'longitude': 140.46694
},
'07466010': {
    'prefecture': 'Fukushima',
    'location': 'Yabuki',
    'latitude': 37.19778,
    'longitude': 140.34167
},
'07481010': {
    'prefecture': 'Fukushima',
    'location': 'Tanagura',
    'latitude': 37.02361,
    'longitude': 140.37639
},
'07368010': {
    'prefecture': 'Fukushima',
    'location': 'MINAMIAIDU',
    'latitude': 37.20083,
    'longitude': 139.78167
},
'07208090': {
    'prefecture': 'Fukushima',
    'location': 'Kitakata',
    'latitude': 37.65972,
    'longitude': 139.87306
},
'07204720': {
    'prefecture': 'Fukushima',
    'location': 'tyuuoudai',
    'latitude': 37.00333,
    'longitude': 140.91861
},
'07204730': {
    'prefecture': 'Fukushima',
    'location': 'jyouban',
    'latitude': 37.00194,
    'longitude': 140.84889
},
'07204740': {
    'prefecture': 'Fukushima',
    'location': 'yotukura',
    'latitude': 37.09361,
    'longitude': 140.89611
},
'07201510': {
    'prefecture': 'Fukushima',
    'location': 'MATUNAMITYOUKYOKU',
    'latitude': 37.76667,
    'longitude': 140.47917
},
'08201030': {
    'prefecture': 'Ibaraki',
    'location': 'Mito_Ishikawa',
    'latitude': 36.38889,
    'longitude': 140.42972
},
'08201040': {
    'prefecture': 'Ibaraki',
    'location': 'Mito_Toubu',
    'latitude': 36.31667,
    'longitude': 140.50278
},
'08201510': {
    'prefecture': 'Ibaraki',
    'location': 'Mito_Daikumachi',
    'latitude': 36.37778,
    'longitude': 140.46139
},
'08202020': {
    'prefecture': 'Ibaraki',
    'location': 'Hitachi_shiyakusho',
    'latitude': 36.59694,
    'longitude': 140.65472
},
'08202040': {
    'prefecture': 'Ibaraki',
    'location': 'Hitachi_Yunago',
    'latitude': 36.56306,
    'longitude': 140.64361
},
'08202050': {
    'prefecture': 'Ibaraki',
    'location': 'Hitachi_Taga',
    'latitude': 36.55417,
    'longitude': 140.62889
},
'08203010': {
    'prefecture': 'Ibaraki',
    'location': 'Chikuseihokenjo',
    'latitude': 36.06778,
    'longitude': 140.19417
},
'08203520': {
    'prefecture': 'Ibaraki',
    'location': 'Tsuchiura_Nakamuraminami',
    'latitude': 36.03833,
    'longitude': 140.16861
},
'08204010': {
    'prefecture': 'Ibaraki',
    'location': 'Koga_hokenjo',
    'latitude': 36.20083,
    'longitude': 139.71889
},
'08205020': {
    'prefecture': 'Ibaraki',
    'location': 'Ishioka_sugimnami',
    'latitude': 36.19917,
    'longitude': 140.28861
},
'08206010': {
    'prefecture': 'Ibaraki',
    'location': 'Tikuseihokennjo',
    'latitude': 36.30667,
    'longitude': 139.97944
},
'08208010': {
    'prefecture': 'Ibaraki',
    'location': 'Ryuugasaki_hokenjo',
    'latitude': 35.90417,
    'longitude': 140.19667
},
'08210010': {
    'prefecture': 'Ibaraki',
    'location': 'Shimotsuma',
    'latitude': 36.18139,
    'longitude': 139.96333
},
'08211010': {
    'prefecture': 'Ibaraki',
    'location': 'Josohokennjo',
    'latitude': 36.03083,
    'longitude': 139.99472
},
'08212010': {
    'prefecture': 'Ibaraki',
    'location': 'hitachioota',
    'latitude': 36.52167,
    'longitude': 140.51972
},
'08213010': {
    'prefecture': 'Ibaraki',
    'location': 'Hitachinakakatsuta',
    'latitude': 36.39306,
    'longitude': 140.5375
},
'08214010': {
    'prefecture': 'Ibaraki',
    'location': 'Takahagi_Honchou',
    'latitude': 36.71194,
    'longitude': 140.71472
},
'08215010': {
    'prefecture': 'Ibaraki',
    'location': 'Kitaibarakinakagou',
    'latitude': 36.77806,
    'longitude': 140.73694
},
'08216010': {
    'prefecture': 'Ibaraki',
    'location': 'Kasamashiyakusyo',
    'latitude': 36.38278,
    'longitude': 140.24194
},
'08217010': {
    'prefecture': 'Ibaraki',
    'location': 'Toride_shiyakusho',
    'latitude': 35.90833,
    'longitude': 140.05278
},
'08220010': {
    'prefecture': 'Ibaraki',
    'location': 'Tsukuba_Kouya',
    'latitude': 36.10167,
    'longitude': 140.02361
},
'08221010': {
    'prefecture': 'Ibaraki',
    'location': 'Hitachinaka',
    'latitude': 36.38139,
    'longitude': 140.50444
},
'08302010': {
    'prefecture': 'Ibaraki',
    'location': 'Higashi-Ibaraki_Ooto',
    'latitude': 36.31389,
    'longitude': 140.42361
},
'08341010': {
    'prefecture': 'Ibaraki',
    'location': 'Hitachinakatokai',
    'latitude': 36.43722,
    'longitude': 140.59306
},
'08344010': {
    'prefecture': 'Ibaraki',
    'location': 'Oomiyanonaka',
    'latitude': 36.55833,
    'longitude': 140.40583
},
'08402010': {
    'prefecture': 'Ibaraki',
    'location': 'Hokodahokenjo',
    'latitude': 36.15611,
    'longitude': 140.52111
},
'08405010': {
    'prefecture': 'Ibaraki',
    'location': 'Kashima_kyuuchuu',
    'latitude': 35.96167,
    'longitude': 140.62528
},
'08405020': {
    'prefecture': 'Ibaraki',
    'location': 'Kashima_Takamagahara',
    'latitude': 35.97167,
    'longitude': 140.65972
},
'08406010': {
    'prefecture': 'Ibaraki',
    'location': 'Kamisu_Shimohatagi',
    'latitude': 35.9125,
    'longitude': 140.63
},
'08406020': {
    'prefecture': 'Ibaraki',
    'location': 'Kokusetsu_Kashima',
    'latitude': 35.88444,
    'longitude': 140.63028
},
'08406030': {
    'prefecture': 'Ibaraki',
    'location': 'Kashima_jimusho',
    'latitude': 35.895,
    'longitude': 140.64361
},
'08406040': {
    'prefecture': 'Ibaraki',
    'location': 'Kamisu_Takahama',
    'latitude': 35.87194,
    'longitude': 140.64861
},
'08406050': {
    'prefecture': 'Ibaraki',
    'location': 'kamisu_syoubou',
    'latitude': 35.88556,
    'longitude': 140.67
},
'08406060': {
    'prefecture': 'Ibaraki',
    'location': 'Kamisu_Ikkanno',
    'latitude': 35.86722,
    'longitude': 140.67361
},
'08406080': {
    'prefecture': 'Ibaraki',
    'location': 'Kamisu_Yokose',
    'latitude': 35.84889,
    'longitude': 140.70611
},
'08407010': {
    'prefecture': 'Ibaraki',
    'location': 'Hasaki_Oota',
    'latitude': 35.835,
    'longitude': 140.74389
},
'08423040': {
    'prefecture': 'Ibaraki',
    'location': 'Itako_hokenjo',
    'latitude': 35.93639,
    'longitude': 140.57083
},
'08441010': {
    'prefecture': 'Ibaraki',
    'location': 'Edosaki_kouminkan',
    'latitude': 35.95056,
    'longitude': 140.32222
},
'08541010': {
    'prefecture': 'Ibaraki',
    'location': 'Souwa_machiyakuba',
    'latitude': 36.17583,
    'longitude': 139.75889
},
'08561510': {
    'prefecture': 'Ibaraki',
    'location': 'Moriya',
    'latitude': 35.9475,
    'longitude': 139.98028
},
'08202200': {
    'prefecture': 'Ibaraki',
    'location': 'HitachiNanbu',
    'latitude': 36.49222,
    'longitude': 140.58583
},
'08342010': {
    'prefecture': 'Ibaraki',
    'location': 'naka',
    'latitude': 36.44806,
    'longitude': 140.50778
},
'09201050': {
    'prefecture': 'Tochigi',
    'location': 'Miyanohara_shougakkou',
    'latitude': 36.53944,
    'longitude': 139.87667
},
'09201060': {
    'prefecture': 'Tochigi',
    'location': 'Suzumenomiya_chuugakkou',
    'latitude': 36.48444,
    'longitude': 139.86722
},
'09201070': {
    'prefecture': 'Tochigi',
    'location': 'Mizuhono_kita_shougakkou',
    'latitude': 36.50472,
    'longitude': 139.94583
},
'09201080': {
    'prefecture': 'Tochigi',
    'location': 'Hosoya_shougakkou',
    'latitude': 36.5875,
    'longitude': 139.85972
},
'09201100': {
    'prefecture': 'Tochigi',
    'location': 'Izumigaoka_shougakkou',
    'latitude': 36.56306,
    'longitude': 139.92333
},
'09201110': {
    'prefecture': 'Tochigi',
    'location': 'Kiyohara',
    'latitude': 36.53111,
    'longitude': 139.98278
},
'09201120': {
    'prefecture': 'Tochigi',
    'location': 'Chuuo',
    'latitude': 36.55694,
    'longitude': 139.88444
},
'09201570': {
    'prefecture': 'Tochigi',
    'location': 'Oodoori',
    'latitude': 36.55833,
    'longitude': 139.88583
},
'09202010': {
    'prefecture': 'Tochigi',
    'location': 'Ashikaga_shiyakusho',
    'latitude': 36.33722,
    'longitude': 139.45278
},
'09203010': {
    'prefecture': 'Tochigi',
    'location': 'Tochigi_shiyakusho',
    'latitude': 36.37917,
    'longitude': 139.73389
},
'09203520': {
    'prefecture': 'Tochigi',
    'location': 'Hiranayagimachi_kousaten',
    'latitude': 36.39139,
    'longitude': 139.78222
},
'09205010': {
    'prefecture': 'Tochigi',
    'location': 'Kanuma_shiyakusho',
    'latitude': 36.56417,
    'longitude': 139.7475
},
'09205510': {
    'prefecture': 'Tochigi',
    'location': 'kanumashi_fudokoro_hodoukyou',
    'latitude': 36.565,
    'longitude': 139.75917
},
'09206010': {
    'prefecture': 'Tochigi',
    'location': 'Nikkoushinikkousyoubousyo',
    'latitude': 36.74889,
    'longitude': 139.61528
},
'09207010': {
    'prefecture': 'Tochigi',
    'location': 'Nikkoushiimaichishougakkou',
    'latitude': 36.72333,
    'longitude': 139.68333
},
'09208010': {
    'prefecture': 'Tochigi',
    'location': 'Oyama_shiyakusho',
    'latitude': 36.31194,
    'longitude': 139.80056
},
'09208510': {
    'prefecture': 'Tochigi',
    'location': 'Chuuouchou_kousaten',
    'latitude': 36.3125,
    'longitude': 139.80528
},
'09209010': {
    'prefecture': 'Tochigi',
    'location': 'Mooka_shiyakusho',
    'latitude': 36.43722,
    'longitude': 140.01583
},
'09209510': {
    'prefecture': 'Tochigi',
    'location': 'Mooka_shi_takamagi_hodoukyou',
    'latitude': 36.43833,
    'longitude': 139.99333
},
'09210010': {
    'prefecture': 'Tochigi',
    'location': 'Ootawara_shiyakusho',
    'latitude': 36.86778,
    'longitude': 140.01944
},
'09211010': {
    'prefecture': 'Tochigi',
    'location': 'Yaita_shiyakusho',
    'latitude': 36.80306,
    'longitude': 139.92694
},
'09211510': {
    'prefecture': 'Tochigi',
    'location': 'YAITASHIOOYATUHODOUKYOU',
    'latitude': 36.75972,
    'longitude': 139.94611
},
'09212010': {
    'prefecture': 'Tochigi',
    'location': 'Nasushiobarashikuroisohokensenta',
    'latitude': 36.96528,
    'longitude': 140.05722
},
'09301010': {
    'prefecture': 'Tochigi',
    'location': 'Kaminokawa-machi_yakuba',
    'latitude': 36.44,
    'longitude': 139.91778
},
'09342010': {
    'prefecture': 'Tochigi',
    'location': 'Mashiko-machi_yakuba',
    'latitude': 36.46472,
    'longitude': 140.09694
},
'09364010': {
    'prefecture': 'Tochigi',
    'location': 'Nokimachi_nokimachiyakuba',
    'latitude': 36.23028,
    'longitude': 139.74417
},
'09383010': {
    'prefecture': 'Tochigi',
    'location': 'nikkoushiyakushohujiharasougoushisho',
    'latitude': 36.88222,
    'longitude': 139.715
},
'09402010': {
    'prefecture': 'Tochigi',
    'location': 'kenminaminasutyousha',
    'latitude': 36.65389,
    'longitude': 140.15333
},
'09204530': {
    'prefecture': 'Tochigi',
    'location': 'sanoshitajimayjirokousaten',
    'latitude': 36.29278,
    'longitude': 139.57028
},
'09201580': {
    'prefecture': 'Tochigi',
    'location': 'hiraide',
    'latitude': 36.5675,
    'longitude': 139.94222
},
'09207510': {
    'prefecture': 'Tochigi',
    'location': 'nikkoushiyakushokasugatyoubuntyousha',
    'latitude': 36.72722,
    'longitude': 139.68222
},
'09301510': {
    'prefecture': 'Tochigi',
    'location': 'kaminokawamachikamigamouhodoukyou',
    'latitude': 36.44444,
    'longitude': 139.90667
},
'09201108': {
    'prefecture': 'Tochigi',
    'location': 'kawachisokuteikyoku',
    'latitude': 36.59972,
    'longitude': 139.94056
},
'09216010': {
    'prefecture': 'Tochigi',
    'location': 'SHIMOTUKESHIMINAMIKAWATITYOUSYA',
    'latitude': 36.38417,
    'longitude': 139.87694
},
'09203030': {
    'prefecture': 'Tochigi',
    'location': 'TOCHIGISHIFUJIOKASOUGOUBUNKASENTA',
    'latitude': 36.26667,
    'longitude': 139.65083
},
'09202520': {
    'prefecture': 'Tochigi',
    'location': 'Ashikaga_kubotakouen',
    'latitude': 36.29389,
    'longitude': 139.48917
},
'09204020': {
    'prefecture': 'tochigi',
    'location': 'Kenasochousha',
    'latitude': 36.33167,
    'longitude': 139.58194
}
}