'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

exports.name = 'defra';

exports.fetchData = function (source, cb) {
  request({url: source.url, headers: {'User-Agent': 'OpenAQ'}}, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(source, body);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
      return cb({message: 'Unknown adapter error.'});
    }
  });
};

var formatData = function (source, data) {
  let measurements = [];
  // Load the html into Cheerio
  var $ = cheerio.load(data);
  $('.current_levels_table').each((i, e) => {
    $('tr', $(e)).each((i, e) => {
      handleLocation(e);
    });
  });

  function sanitizeName (name) {
    return name.trim();
  }

  function sanitizeDate (date) {
    let m = moment.tz(date, 'DD/MM/YYYYHH:mm', 'Europe/London');
    return {utc: m.toDate(), local: m.format('YYYY-MM-DDTHH:mm:ssZ')};
  }

  function getValue (measuredValue) {
    if (measuredValue === 'n/a' || measuredValue === 'n/m') {
      return NaN;
    }

    let idx = measuredValue.indexOf('(');
    return Number(measuredValue.substring(0, idx));
  }

  function handleMeasurement (parameter, el, period, base) {
    let m = Object.assign({}, base);
    m.value = getValue($(el).text());
    m.parameter = parameter;
    m.averagingPeriod = period;
    m.unit = 'µg/m³';
    if (isNaN(m.value)) {
      return;
    }

    return m;
  }

  function handleLocation (row) {
    // Create base
    let base = {
      location: sanitizeName($($('a', $('td', $(row)).get(0)).get(0)).text()),
      date: sanitizeDate($($('td', $(row)).get(6)).text()),
      attribution: [{
        name: 'Department for Environmental Food & Rural Affairs',
        url: source.url
      }]
    };

    // Do nothing if we have a nav item
    if (base.location.indexOf('navigation') !== -1) {
      return;
    }

    // Add metadata if available
    base = Object.assign(base, metadata[base.location]);

    // O3
    let o3 = handleMeasurement(
      'o3',
      $($('td', $(row)).get(1)),
      {'value': 8, 'unit': 'hours'},
      base
    );
    if (o3) {
      measurements.push(o3);
    }

    // NO2
    let no2 = handleMeasurement(
      'no2',
      $($('td', $(row)).get(2)),
      {'value': 1, 'unit': 'hours'},
      base
    );
    if (no2) {
      measurements.push(no2);
    }

    // SO2
    let so2 = handleMeasurement(
      'so2',
      $($('td', $(row)).get(3)),
      {'value': 0.25, 'unit': 'hours'},
      base
    );
    if (so2) {
      measurements.push(so2);
    }

    // pm25
    let pm25 = handleMeasurement(
      'pm25',
      $($('td', $(row)).get(4)),
      {'value': 24, 'unit': 'hours'},
      base
    );
    if (pm25) {
      measurements.push(pm25);
    }
    // pm10
    let pm10 = handleMeasurement(
      'pm10',
      $($('td', $(row)).get(5)),
      {'value': 24, 'unit': 'hours'},
      base
    );
    if (pm10) {
      measurements.push(pm10);
    }
  }

  return {
    name: 'unused',
    measurements: measurements
  };
};

// Values from location pages at https://uk-air.defra.gov.uk/latest/currentlevels
let metadata = {
  'Sheffield Barnsley Road':
   { city: 'Yorkshire & Humberside',
     coordinates: { latitude: 53.404950, longitude: -1.455815 } },
  'Cannock A5190 Roadside':
   { city: 'West Midlands',
     coordinates: { latitude: 52.687298, longitude: -1.980821 } },
  'Christchurch Barrack Road':
   { city: 'South West',
     coordinates: { latitude: 50.735454, longitude: -1.780888 } },
  'St Helens Linkway':
   { city: 'North West & Merseyside',
     coordinates: { latitude: 53.451826, longitude: -2.742134 } },
  'Greenock A8 Roadside':
   { city: 'Central Scotland',
     coordinates: { latitude: 55.944079, longitude: -4.734421 } },
  'Birkenhead Borough Road':
   { city: 'North West & Merseyside',
     coordinates: { latitude: 53.388511, longitude: -3.025014 } },
  'Worthing A27 Roadside':
   { city: 'South East',
     coordinates: { latitude: 50.832947, longitude: -0.379916 } },
  'Birmingham A4540 Roadside':
   { city: 'West Midlands',
     coordinates: { latitude: 52.476090, longitude: -1.875024 } },
  'Bush Estate':
   { city: 'Bush Estate',
     coordinates: { latitude: 55.862281, longitude: -3.205782 } },
  'Dumbarton Roadside':
   { city: 'Dumbarton',
     coordinates: { latitude: 55.943197, longitude: -4.55973 } },
  'Glasgow Great Western Road':
   { city: 'Glasgow',
     coordinates: { latitude: 55.872038, longitude: -4.270936 } },
  'Edinburgh St Leonards':
   { city: 'Edinburgh',
     coordinates: { latitude: 55.945589, longitude: -3.182186 } },
  'Auchencorth Moss':
   { city: 'Auchencorth',
     coordinates: { latitude: 55.79216, longitude: -3.2429 } },
  'Glasgow High Street':
   { city: 'Glasgow',
     coordinates: { latitude: 55.860936, longitude: -4.238214 } },
  'Glasgow Kerbside':
   { city: 'Glasgow',
     coordinates: { latitude: 55.85917, longitude: -4.258889 } },
  'Glasgow Townhead':
   { city: 'Glasgow',
     coordinates: { latitude: 55.865782, longitude: -4.243631 } },
  Grangemouth:
   { city: 'Grangemouth',
     coordinates: { latitude: 56.010319, longitude: -3.704399 } },
  'Grangemouth Moray':
   { city: 'Grangemouth',
     coordinates: { latitude: 56.013142, longitude: -3.710833 } },
  Bottesford:
   { city: 'Bottesford',
     coordinates: { latitude: 52.93028, longitude: -0.814722 } },
  'Chesterfield Roadside':
   { city: 'Chesterfield',
     coordinates: { latitude: 53.231722, longitude: -1.456944 } },
  'Chesterfield Loundsley Green':
   { city: 'Chesterfield',
     coordinates: { latitude: 53.244131, longitude: -1.454946 } },
  Ladybower:
   { city: 'Ladybower',
     coordinates: { latitude: 53.40337, longitude: -1.752006 } },
  'Leicester University':
   { city: 'Leicester',
     coordinates: { latitude: 52.619823, longitude: -1.127311 } },
  'Northampton Kingsthorpe':
   { city: 'Northampton',
     coordinates: { latitude: 52.271886, longitude: -0.879898 } },
  'Market Harborough':
   { city: 'Market Harborough',
     coordinates: { latitude: 52.554444, longitude: -0.772222 } },
  'Lincoln Canwick Rd.':
   { city: 'Lincoln',
     coordinates: { latitude: 53.221373, longitude: -0.534189 } },
  'Leicester A594 Roadside':
   { city: 'Leicester',
     coordinates: { latitude: 52.638677, longitude: -1.124228 } },
  'Nottingham Western Boulevard':
   { city: 'Nottingham',
     coordinates: { latitude: 52.969377, longitude: -1.188851 } },
  'Nottingham Centre':
   { city: 'Nottingham',
     coordinates: { latitude: 52.95473, longitude: -1.146447 } },
  'Luton A505 Roadside':
   { city: 'Luton',
     coordinates: { latitude: 51.892293, longitude: -0.46211 } },
  'Cambridge Roadside':
   { city: 'Cambridge',
     coordinates: { latitude: 52.20237, longitude: 0.124456 } },
  'Norwich Lakenfields':
   { city: 'Norwich',
     coordinates: { latitude: 52.614193, longitude: 1.301976 } },
  'Sandy Roadside':
   { city: 'Sandy',
     coordinates: { latitude: 52.132417, longitude: -0.300306 } },
  Sibton:
   { city: 'Sibton',
     coordinates: { latitude: 52.2944, longitude: 1.463497 } },
  'Southend-on-Sea':
   { city: 'London',
     coordinates: { latitude: 51.544206, longitude: 0.678408 } },
  'St Osyth':
   { city: 'St Osyth',
     coordinates: { latitude: 51.77798, longitude: 1.049031 } },
  'Stanford-le-Hope Roadside':
   { city: 'Stanford-le-Hope',
     coordinates: { latitude: 51.518167, longitude: 0.439548 } },
  Thurrock:
   { city: 'London',
     coordinates: { latitude: 51.47707, longitude: 0.317969 } },
  Weybourne:
   { city: 'Weybourne',
     coordinates: { latitude: 52.95049, longitude: 1.122017 } },
  'Wicken Fen':
   { city: 'Wicken Fen',
     coordinates: { latitude: 52.2985, longitude: 0.290917 } },
  'Ealing Horn Lane':
   { city: 'London',
     coordinates: { latitude: 51.51895, longitude: -0.265617 } },
  'Camden Kerbside':
   { city: 'London',
     coordinates: { latitude: 51.54421, longitude: -0.175269 } },
  'Haringey Roadside':
   { city: 'London',
     coordinates: { latitude: 51.5993, longitude: -0.068218 } },
  'London Bexley':
   { city: 'London',
     coordinates: { latitude: 51.46603, longitude: 0.184806 } },
  'London Bloomsbury':
   { city: 'London',
     coordinates: { latitude: 51.52229, longitude: -0.125889 } },
  'London Eltham':
   { city: 'London',
     coordinates: { latitude: 51.45258, longitude: 0.070766 } },
  'London Haringey Priory Park South':
   { city: 'London',
     coordinates: { latitude: 51.584128, longitude: -0.125254 } },
  'London Harlington':
   { city: 'London',
     coordinates: { latitude: 51.48879, longitude: -0.441614 } },
  'London Harrow Stanmore':
   { city: 'London',
     coordinates: { latitude: 51.617333, longitude: -0.298777 } },
  'London Hillingdon':
   { city: 'London',
     coordinates: { latitude: 51.49633, longitude: -0.460861 } },
  'London N. Kensington':
   { city: 'London',
     coordinates: { latitude: 51.52105, longitude: -0.213492 } },
  'London Teddington':
   { city: 'London',
     coordinates: { latitude: 51.42099, longitude: -0.339647 } },
  'London Marylebone Road':
   { city: 'London',
     coordinates: { latitude: 51.52253, longitude: -0.154611 } },
  'London Teddington Bushy Park':
   { city: 'London',
     coordinates: { latitude: 51.425286, longitude: -0.345606 } },
  'London Westminster':
   { city: 'London',
     coordinates: { latitude: 51.49467, longitude: -0.131931 } },
  'Southwark A2 Old Kent Road':
   { city: 'London',
     coordinates: { latitude: 51.480499, longitude: -0.05955 } },
  'Tower Hamlets Roadside':
   { city: 'London',
     coordinates: { latitude: 51.52253, longitude: -0.042155 } },
  'Fort William':
   { city: 'Fort William',
     coordinates: { latitude: 56.82266, longitude: -5.101102 } },
  Inverness:
   { city: 'Inverness',
     coordinates: { latitude: 57.481308, longitude: -4.241451 } },
  Lerwick:
   { city: 'Lerwick',
     coordinates: { latitude: 60.13922, longitude: -1.185319 } },
  Strathvaich:
   { city: 'Strath Vaich',
     coordinates: { latitude: 57.734456, longitude: -4.776583 } },
  Billingham:
   { city: 'Billingham',
     coordinates: { latitude: 54.60537, longitude: -1.275039 } },
  Middlesbrough:
   { city: 'Middlesbrough',
     coordinates: { latitude: 54.569297, longitude: -1.220874 } },
  'Newcastle Centre':
   { city: 'Newcastle',
     coordinates: { latitude: 54.97825, longitude: -1.610528 } },
  'Newcastle Cradlewell Roadside':
   { city: 'Newcastle',
     coordinates: { latitude: 54.986405, longitude: -1.595362 } },
  'Stockton-on-Tees A1305 Roadside':
   { city: 'Stockton-on-Tees',
     coordinates: { latitude: 54.565819, longitude: -1.3159 } },
  'Stockton-on-Tees Eaglescliffe':
   { city: 'Stockton-on-Tees',
     coordinates: { latitude: 54.516667, longitude: -1.358547 } },
  'Sunderland Silksworth':
   { city: 'Sunderland',
     coordinates: { latitude: 54.88361, longitude: -1.406878 } },
  'Sunderland Wessington Way':
   { city: 'Sunderland',
     coordinates: { latitude: 54.91839, longitude: -1.408391 } },
  Aberdeen:
   { city: 'Aberdeen',
     coordinates: { latitude: 57.157360, longitude: -2.094278 } },
  'Aberdeen Union Street Roadside':
   { city: 'Aberdeen',
     coordinates: { latitude: 57.144555, longitude: -2.106472 } },
  'Aberdeen Wellington Road':
   { city: 'Aberdeen',
     coordinates: { latitude: 57.133888, longitude: -2.094198 } },
  'Aston Hill':
   { city: 'Aston Hill',
     coordinates: { latitude: 52.50385, longitude: -3.034178 } },
  Wrexham:
   { city: 'Wrexham',
     coordinates: { latitude: 53.04222, longitude: -3.002778 } },
  'Blackburn Accrington Road':
   { city: 'Blackburn',
     coordinates: { latitude: 53.747751, longitude: -2.452724 } },
  'Blackpool Marton':
   { city: 'Blackpool',
     coordinates: { latitude: 53.80489, longitude: -3.007175 } },
  'Bury Whitefield Roadside':
   { city: 'Bury',
     coordinates: { latitude: 53.559029, longitude: -2.293772 } },
  'Carlisle Roadside':
   { city: 'Carlisle',
     coordinates: { latitude: 54.894834, longitude: -2.945307 } },
  Glazebury:
   { city: 'Glazebury',
     coordinates: { latitude: 53.46008, longitude: -2.472056 } },
  'Liverpool Queen\'s Drive Roadside':
   { city: 'Liverpool',
     coordinates: { latitude: 53.446944, longitude: -2.9625 } },
  'Great Dun Fell':
   { city: 'Great Dun Fell',
     coordinates: { latitude: 54.684233, longitude: -2.450799 } },
  'Liverpool Speke':
   { city: 'Liverpool',
     coordinates: { latitude: 53.34633, longitude: -2.844333 } },
  'Manchester Piccadilly':
   { city: 'Manchester',
     coordinates: { latitude: 53.48152, longitude: -2.237881 } },
  'Manchester Sharston':
   { city: 'Manchester',
     coordinates: { latitude: 53.371306, longitude: -2.239218 } },
  Preston:
   { city: 'Preston',
     coordinates: { latitude: 53.76559, longitude: -2.680353 } },
  'Salford Eccles':
   { city: 'Manchester',
     coordinates: { latitude: 53.48481, longitude: -2.334139 } },
  'Shaw Crompton Way':
   { city: 'Crompton Way   OL2 8AQ',
     coordinates: { latitude: 53.579283, longitude: -2.093786 } },
  Warrington:
   { city: 'Warrington',
     coordinates: { latitude: 53.38928, longitude: -2.615358 } },
  'Widnes Milton Road':
   { city: 'Widnes',
     coordinates: { latitude: 53.365391, longitude: -2.73168 } },
  'Wigan Centre':
   { city: 'Wigan',
     coordinates: { latitude: 53.54914, longitude: -2.638139 } },
  'Armagh Roadside':
   { city: 'Armagh',
     coordinates: { latitude: 54.353728, longitude: -6.654558 } },
  'Wirral Tranmere':
   { city: 'Liverpool',
     coordinates: { latitude: 53.37287, longitude: -3.022722 } },
  'Ballymena Ballykeel':
   { city: 'Ballymena',
     coordinates: { latitude: 54.861595, longitude: -6.250873 } },
  'Belfast Centre':
   { city: 'Belfast',
     coordinates: { latitude: 54.59965, longitude: -5.928833 } },
  'Belfast Stockman\'s Lane':
   { city: 'Belfast',
     coordinates: { latitude: 54.572586, longitude: -5.974944 } },
  'Derby St Alkmund\'s Way':
   { city: 'Derby',
     coordinates: { latitude: 52.922983, longitude: -1.469507 } },
  Derry:
   { city: 'Derry',
     coordinates: { latitude: 55.001225, longitude: -7.329115 } },
  'Derry Rosemount':
   { city: 'Derry',
     coordinates: { latitude: 55.002818, longitude: -7.331179 } },
  Dumfries:
   { city: 'Dumfries',
     coordinates: { latitude: 55.070033, longitude: -3.614233 } },
  'Lough Navar':
   { city: 'Lough Navar',
     coordinates: { latitude: 54.43951, longitude: -7.900328 } },
  Eskdalemuir:
   { city: 'Eskdalemuir',
     coordinates: { latitude: 55.31531, longitude: -3.206111 } },
  Peebles:
   { city: 'Peebles',
     coordinates: { latitude: 55.657472, longitude: -3.196527 } },
  'Brighton Preston Park':
   { city: 'Brighton',
     coordinates: { latitude: 50.840836, longitude: -0.147572 } },
  Canterbury:
   { city: 'Canterbury',
     coordinates: { latitude: 51.27399, longitude: 1.098061 } },
  'Chatham Roadside':
   { city: 'Chatham',
     coordinates: { latitude: 51.374264, longitude: 0.54797 } },
  Eastbourne:
   { city: 'Eastbourne',
     coordinates: { latitude: 50.805778, longitude: 0.271611 } },
  Horley:
   { city: 'Horley',
     coordinates: { latitude: 51.165865, longitude: -0.167734 } },
  'Chilbolton Observatory':
   { city: 'Stockbridge',
     coordinates: { latitude: 51.149617, longitude: -1.438228 } },
  'Lullington Heath':
   { city: 'Lullington Heath',
     coordinates: { latitude: 50.7937, longitude: 0.18125 } },
  'Oxford Centre Roadside':
   { city: 'Oxford',
     coordinates: { latitude: 51.751745, longitude: -1.257463 } },
  'Oxford St Ebbes':
   { city: 'Oxford',
     coordinates: { latitude: 51.744806, longitude: -1.260278 } },
  Portsmouth:
   { city: 'Portsmouth',
     coordinates: { latitude: 50.82881, longitude: -1.068583 } },
  'Reading New Town':
   { city: 'Reading',
     coordinates: { latitude: 51.45309, longitude: -0.944067 } },
  'Reading London Rd.':
   { city: 'Reading',
     coordinates: { latitude: 51.454896, longitude: -0.940382 } },
  'Rochester Stoke':
   { city: 'Rochester',
     coordinates: { latitude: 51.45617, longitude: 0.634889 } },
  'Southampton A33':
   { city: 'Southampton',
     coordinates: { latitude: 50.920265, longitude: -1.463484 } },
  'Southampton Centre':
   { city: 'Southampton',
     coordinates: { latitude: 50.90814, longitude: -1.395778 } },
  'Storrington Roadside':
   { city: 'Storrington',
     coordinates: { latitude: 50.916932, longitude: -0.449548 } },
  'Cardiff Centre':
   { city: 'Cardiff',
     coordinates: { latitude: 51.48178, longitude: -3.17625 } },
  'Chepstow A48':
   { city: 'Chepstow',
     coordinates: { latitude: 51.638094, longitude: -2.678731 } },
  Cwmbran:
   { city: 'Cardiff',
     coordinates: { latitude: 51.6538, longitude: -3.006953 } },
  'Hafod-yr-ynys Roadside':
   { city: 'Swfrryd',
     coordinates: { latitude: 51.680579, longitude: -3.133508 } },
  Narberth:
   { city: 'Narberth',
     coordinates: { latitude: 51.781784, longitude: -4.691462 } },
  Newport:
   { city: 'Newport',
     coordinates: { latitude: 51.601203, longitude: -2.977281 } },
  'Port Talbot Margam':
   { city: 'Port Talbot',
     coordinates: { latitude: 51.58395, longitude: -3.770822 } },
  'Swansea Roadside':
   { city: 'Swansea',
     coordinates: { latitude: 51.632696, longitude: -3.947374 } },
  'Barnstaple A39':
   { city: 'Barnstaple',
     coordinates: { latitude: 51.074793, longitude: -4.041924 } },
  'Bath Roadside':
   { city: 'Bath',
     coordinates: { latitude: 51.391127, longitude: -2.354155 } },
  Bournemouth:
   { city: 'Bournemouth',
     coordinates: { latitude: 50.73957, longitude: -1.826744 } },
  'Charlton Mackrell':
   { city: 'Charlton',
     coordinates: { latitude: 51.05625, longitude: -2.68345 } },
  'Bristol St Paul\'s':
   { city: 'Bristol',
     coordinates: { latitude: 51.462839, longitude: -2.584482 } },
  'Exeter Roadside':
   { city: 'Exeter',
     coordinates: { latitude: 50.725083, longitude: -3.532465 } },
  Honiton:
   { city: 'Honiton',
     coordinates: { latitude: 50.792287, longitude: -3.196702 } },
  'Saltash Callington Road':
   { city: 'Saltash',
     coordinates: { latitude: 50.411463, longitude: -4.227678 } },
  'Plymouth Centre':
   { city: 'Plymouth',
     coordinates: { latitude: 50.37167, longitude: -4.142361 } },
  'Plymouth Tavistock Road.':
   { city: 'Plymouth',
     coordinates: { latitude: 50.411058, longitude: -4.130288 } },
  'Mace Head':
   { city: 'Mace Head',
     coordinates: { latitude: 53.326444, longitude: -9.903917 } },
  'Yarner Wood':
   { city: 'Yarner Wood',
     coordinates: { latitude: 50.5976, longitude: -3.71651 } },
  'Birmingham Acocks Green':
   { city: 'Birmingham',
     coordinates: { latitude: 52.437165, longitude: -1.829999 } },
  'Birmingham Tyburn':
   { city: 'Birmingham',
     coordinates: { latitude: 52.511722, longitude: -1.830583 } },
  'Leamington Spa':
   { city: 'Leamington Spa',
     coordinates: { latitude: 52.28881, longitude: -1.533119 } },
  'Coventry Allesley':
   { city: 'Coventry',
     coordinates: { latitude: 52.411563, longitude: -1.560228 } },
  'Birmingham Tyburn Roadside':
   { city: 'Birmingham',
     coordinates: { latitude: 52.512194, longitude: -1.830861 } },
  'Leamington Spa Rugby Road':
   { city: 'Leamington Spa',
     coordinates: { latitude: 52.294884, longitude: -1.542911 } },
  Leominster:
   { city: 'Leominster',
     coordinates: { latitude: 52.22174, longitude: -2.736665 } },
  'Oldbury Birmingham Road':
   { city: 'Oldbury',
     coordinates: { latitude: 52.502436, longitude: -2.003497 } },
  'Stoke-on-Trent A50 Roadside':
   { city: 'Stoke-on-Trent',
     coordinates: { latitude: 52.980436, longitude: -2.111898 } },
  'Stoke-on-Trent Centre':
   { city: 'Stoke-on-Trent',
     coordinates: { latitude: 53.02821, longitude: -2.175133 } },
  'Walsall Woodlands':
   { city: 'Willenhall',
     coordinates: { latitude: 52.605621, longitude: -2.030523 } },
  'Barnsley Gawber':
   { city: 'Barnsley',
     coordinates: { latitude: 53.56292, longitude: -1.510436 } },
  'Bradford Mayo Avenue':
   { city: 'Bradford',
     coordinates: { latitude: 53.771245, longitude: -1.759774 } },
  'Doncaster A630 Cleveland Street':
   { city: 'Doncaster',
     coordinates: { latitude: 53.518868, longitude: -1.138073 } },
  'High Muffles':
   { city: 'High Muffles',
     coordinates: { latitude: 54.334944, longitude: -0.80855 } },
  'Hull Freetown':
   { city: 'Hull',
     coordinates: { latitude: 53.74878, longitude: -0.341222 } },
  'Hull Holderness Road':
   { city: 'Yorkshire',
     coordinates: { latitude: 53.758971, longitude: -0.305749 } },
  'Leeds Centre':
   { city: 'Leeds',
     coordinates: { latitude: 53.80378, longitude: -1.546472 } },
  'Leeds Headingley Kerbside':
   { city: 'Leeds',
     coordinates: { latitude: 53.819972, longitude: -1.576361 } },
  'Scunthorpe Town':
   { city: 'Scunthorpe',
     coordinates: { latitude: 53.58634, longitude: -0.636811 } },
  'Sheffield Devonshire Green':
   { city: 'Sheffield',
     coordinates: { latitude: 53.378622, longitude: -1.478096 } },
  'Sheffield Tinsley':
   { city: 'Sheffield',
     coordinates: { latitude: 53.41058, longitude: -1.396139 } },
  'York Bootham':
   { city: 'York',
     coordinates: { latitude: 53.967513, longitude: -1.086514 } },
  'York Fishergate':
   { city: 'York',
     coordinates: { latitude: 53.951889, longitude: -1.075861 } }
};
