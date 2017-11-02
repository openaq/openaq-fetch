'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { acceptableParameters, convertUnits } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'arpae';

const ckanResourceID = 'a1c46cfe-46e5-44b4-9231-7d9260a38e68';

exports.fetchData = function (source, cb) {
  const before = moment.tz(source.timezone).subtract(3, 'days').format('Y-M-DT00:00:00');
  const sql = `SELECT * from "${ckanResourceID}" WHERE reftime >= '${before}' ORDER BY reftime DESC`;
  const queryUrl = `https://dati.arpae.it/api/action/datastore_search_sql?sql=${sql}`;

  request(queryUrl, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb(err || res);
    }
    const data = JSON.parse(body);
    const records = data['result']['records'];
    let measurements = [];
    records.forEach((record) => {
      const parameter = parameters[record.variable_id].parameter;
      if ((acceptableParameters.indexOf(parameter) === -1) ||
          (!locations[record.station_id])) {
        // unexpected parameter or
        // location detail unknown, skip
        return;
      }
      const unit = parameters[record.variable_id].unit;
      const location = locations[record.station_id].station;
      const city = locations[record.station_id].comune;
      const coordinates = locations[record.station_id].coordinates;

      const mDate = moment.tz(record.reftime, source.timezone);
      measurements.push({
        value: Number(record.value),
        unit: unit,
        parameter: parameter,
        date: {
          utc: mDate.toDate(),
          local: mDate.format()
        },
        country: source.country,
        city: city,
        location: location,
        coordinates: coordinates,
        averagingPeriod: {
          value: 1,
          unit: 'hours'
        },
        attribution: [
          {
            name: source.name,
            url: source.sourceURL
          }
        ]
      });
    });

    measurements = convertUnits(measurements);

    return cb(null, {
      name: 'unused',
      measurements: measurements
    });
  });
};

// parameter ID mapping
// generated with ../data_scripts/arpae-parameters.js
const parameters = {
  '1': { parameter: 'so2', unit: 'ug/m3' },
  '5': { parameter: 'pm10', unit: 'ug/m3' },
  '7': { parameter: 'o3', unit: 'ug/m3' },
  '8': { parameter: 'no2', unit: 'ug/m3' },
  '9': { parameter: 'nox', unit: 'ug/m3' },
  '10': { parameter: 'co', unit: 'mg/m3' },
  '20': { parameter: 'c6h6', unit: 'ug/m3' },
  '21': { parameter: 'c6h5-ch3', unit: 'ug/m3' },
  '38': { parameter: 'no', unit: 'ug/m3' },
  '82': { parameter: 'o-xylene', unit: 'ug/m3' },
  '111': { parameter: 'pm2.5', unit: 'ug/m3' }
};

const locations = {
  '2000003':
  { station: 'CITTADELLA',
    comune: 'PARMA',
    coordinates: { latitude: 44.7924, longitude: 10.331 } },
  '2000004':
  { station: 'MONTEBELLO',
    comune: 'PARMA',
    coordinates: { latitude: 44.7866, longitude: 10.3365 } },
  '2000214':
  { station: 'BADIA',
    comune: 'LANGHIRANO',
    coordinates: { latitude: 44.6582, longitude: 10.2894 } },
  '2000219':
  { station: 'SARAGAT',
    comune: 'COLORNO',
    coordinates: { latitude: 44.926, longitude: 10.3719 } },
  '2000229':
  { station: 'MALCANTONE',
    comune: 'MEZZANI',
    coordinates: { latitude: 44.8909, longitude: 10.3996 } },
  '2000230':
  { station: 'BOGOLESE',
    comune: 'SORBOLO',
    coordinates: { latitude: 44.8291, longitude: 10.3915 } },
  '2000232':
  { station: 'PARADIGNA',
    comune: 'PARMA',
    coordinates: { latitude: 44.8413, longitude: 10.3446 } },
  '3000001':
  { station: 'CASTELLARANO',
    comune: 'CASTELLARANO',
    coordinates: { latitude: 44.5162, longitude: 10.7339 } },
  '3000007':
  { station: 'S. LAZZARO',
    comune: 'REGGIO NELL\'EMILIA',
    coordinates: { latitude: 44.689, longitude: 10.6636 } },
  '3000018':
  { station: 'FEBBIO',
    comune: 'VILLA MINOZZO',
    coordinates: { latitude: 44.3007, longitude: 10.431 } },
  '3000022':
  { station: 'S. ROCCO',
    comune: 'GUASTALLA',
    coordinates: { latitude: 44.8737, longitude: 10.6648 } },
  '3000025':
  { station: 'TIMAVO',
    comune: 'REGGIO NELL\'EMILIA',
    coordinates: { latitude: 44.6996, longitude: 10.6228 } },
  '4000002':
  { station: 'GIARDINI',
    comune: 'MODENA',
    coordinates: { latitude: 44.637, longitude: 10.9057 } },
  '4000012':
  { station: 'REMESINA',
    comune: 'CARPI',
    coordinates: { latitude: 44.8004, longitude: 10.8843 } },
  '4000022':
  { station: 'PARCO FERRARI',
    comune: 'MODENA',
    coordinates: { latitude: 44.6516, longitude: 10.9073 } },
  '4000110':
  { station: 'SAN FRANCESCO',
    comune: 'FIORANO MODENESE',
    coordinates: { latitude: 44.5422, longitude: 10.8199 } },
  '4000152':
  { station: 'GAVELLO',
    comune: 'MIRANDOLA',
    coordinates: { latitude: 44.9288, longitude: 11.1789 } },
  '4000155':
  { station: 'PARCO EDILCARANI',
    comune: 'SASSUOLO',
    coordinates: { latitude: 44.5404, longitude: 10.7924 } },
  '5000007':
  { station: 'LUGAGNANO',
    comune: 'LUGAGNANO VAL D\'ARDA',
    coordinates: { latitude: 44.8239, longitude: 9.8304 } },
  '5000020':
  { station: 'CENO',
    comune: 'PIACENZA',
    coordinates: { latitude: 45.0544, longitude: 9.7269 } },
  '5000024':
  { station: 'GERBIDO',
    comune: 'PIACENZA',
    coordinates: { latitude: 45.0559, longitude: 9.7479 } },
  '5000033':
  { station: 'GIORDANI-FARNESE',
    comune: 'PIACENZA',
    coordinates: { latitude: 45.0488, longitude: 9.6933 } },
  '5000062':
  { station: 'BESENZONE',
    comune: 'BESENZONE',
    coordinates: { latitude: 44.9895, longitude: 10.0192 } },
  '5000065':
  { station: 'PARCO MONTECUCCO',
    comune: 'PIACENZA',
    coordinates: { latitude: 45.0385, longitude: 9.6693 } },
  '5000066':
  { station: 'CORTE BRUGNATELLA',
    comune: 'CORTE BRUGNATELLA',
    coordinates: { latitude: 44.7347, longitude: 9.3669 } },
  '6000010':
  { station: 'PARCO RESISTENZA',
    comune: 'FORLI\'',
    coordinates: { latitude: 44.2152, longitude: 12.0482 } },
  '6000011':
  { station: 'ROMA',
    comune: 'FORLI\'',
    coordinates: { latitude: 44.216, longitude: 12.0575 } },
  '6000014':
  { station: 'FRANCHINI-ANGELONI',
    comune: 'CESENA',
    coordinates: { latitude: 44.1414, longitude: 12.2447 } },
  '6000031':
  { station: 'SAVIGNANO',
    comune: 'SAVIGNANO SUL RUBICONE',
    coordinates: { latitude: 44.0969, longitude: 12.4033 } },
  '6000036':
  { station: 'SAVIGNANO DI RIGO',
    comune: 'SOGLIANO AL RUBICONE',
    coordinates: { latitude: 43.9274, longitude: 12.2248 } },
  '7000002':
  { station: 'DE AMICIS',
    comune: 'IMOLA',
    coordinates: { latitude: 44.3554, longitude: 11.7207 } },
  '7000014':
  { station: 'GIARDINI MARGHERITA',
    comune: 'BOLOGNA',
    coordinates: { latitude: 44.4836, longitude: 11.355 } },
  '7000015':
  { station: 'PORTA SAN FELICE',
    comune: 'BOLOGNA',
    coordinates: { latitude: 44.5, longitude: 11.3285 } },
  '7000024':
  { station: 'SAN LAZZARO',
    comune: 'SAN LAZZARO DI SAVENA',
    coordinates: { latitude: 44.4672, longitude: 11.4166 } },
  '7000027':
  { station: 'SAN PIETRO CAPOFIUME',
    comune: 'MOLINELLA',
    coordinates: { latitude: 44.6542, longitude: 11.6248 } },
  '7000041':
  { station: 'VIA CHIARINI',
    comune: 'BOLOGNA',
    coordinates: { latitude: 44.5001, longitude: 11.2861 } },
  '7000042':
  { station: 'CASTELLUCCIO',
    comune: 'PORRETTA TERME',
    coordinates: { latitude: 44.1404, longitude: 10.9172 } },
  '8000002':
  { station: 'ISONZO',
    comune: 'FERRARA',
    coordinates: { latitude: 44.8425, longitude: 11.6131 } },
  '8000007':
  { station: 'GHERARDI',
    comune: 'JOLANDA DI SAVOIA',
    coordinates: { latitude: 44.8397, longitude: 11.9613 } },
  '8000038':
  { station: 'CENTO',
    comune: 'CENTO',
    coordinates: { latitude: 44.733, longitude: 11.2997 } },
  '8000040':
  { station: 'VILLA FULVIA',
    comune: 'FERRARA',
    coordinates: { latitude: 44.8243, longitude: 11.6496 } },
  '8000041':
  { station: 'OSTELLATO',
    comune: 'OSTELLATO',
    coordinates: { latitude: 44.7409, longitude: 11.9419 } },
  '9000014':
  { station: 'ZALAMELLA',
    comune: 'RAVENNA',
    coordinates: { latitude: 44.4278, longitude: 12.1865 } },
  '9000021':
  { station: 'CAORLE',
    comune: 'RAVENNA',
    coordinates: { latitude: 44.4193, longitude: 12.2254 } },
  '9000068':
  { station: 'BALLIRANA',
    comune: 'ALFONSINE',
    coordinates: { latitude: 44.5274, longitude: 11.9824 } },
  '9000070':
  { station: 'DELTA CERVIA',
    comune: 'CERVIA',
    coordinates: { latitude: 44.2839, longitude: 12.3322 } },
  '9000083':
  { station: 'PARCO BERTOZZI',
    comune: 'FAENZA',
    coordinates: { latitude: 44.2856, longitude: 11.8734 } },
  '10000001':
  { station: 'FLAMINIA',
    comune: 'RIMINI',
    coordinates: { latitude: 44.0521, longitude: 12.5757 } },
  '10000059':
  { station: 'VERUCCHIO',
    comune: 'VERUCCHIO',
    coordinates: { latitude: 44.0139, longitude: 12.421 } },
  '10000060':
  { station: 'SAN CLEMENTE',
    comune: 'SAN CLEMENTE',
    coordinates: { latitude: 43.9318, longitude: 12.6273 } },
  '10000074':
  { station: 'SAN LEO',
    comune: 'SAN LEO',
    coordinates: { latitude: 43.9072, longitude: 12.4012 } }
};
