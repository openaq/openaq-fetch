'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import { default as moment } from 'moment-timezone';
import { convertUnits, safeParse, acceptableParameters } from '../lib/utils';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'data_gov_in';

export function fetchData (source, cb) {
  // Load initial results set and grab more if needed recursively
  let offset = 0;
  const limit = 1000;
  const url = `${source.url}?api-key=${process.env.DATA_GOV_IN_TOKEN}&limit=${limit}&fields=city,station,last_update,pollutant_id,pollutant_avg&format=json`;
  let results = [];
  const getResults = function (url) {
    return getData(url, (err, body) => {
      if (err) {
        return cb({message: err.message});
      }

      // Build up a results array
      results = results.concat(body.records);
      // If we haven't gotten all the results, keep on going!
      if (results.length < Number(body.total)) {
        offset += limit;
        return getResults(`${url}&offset=${offset}`);
      } else {
        // Wrap everything in a try/catch in case something goes wrong
        try {
          // Format the data
          const data = formatData(results);

          // Make sure the data is valid
          if (data === undefined) {
            return cb({message: 'Failure to format data.'});
          }
          return cb(null, data);
        } catch (e) {
          return cb({message: 'Unknown adapter error.'});
        }
      }
    });
  };
  getResults(url);
}

const getData = function (url, cb) {
  request(url, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    body = safeParse(body);
    if (body === undefined) {
      return cb({message: 'Failure to parse data.'});
    }

    return cb(null, body);
  });
};

const formatData = function (results) {
  results = results.map((r) => {
    // Location
    r.location = r.station;
    delete r.station;

    // Parameter
    r.parameter = r.pollutant_id.toLowerCase().replace('.', '');
    if (r.parameter === 'ozone') { r.parameter = 'o3'; }
    delete r.pollutant_id;

    // Unit
    r.unit = (r.parameter === 'co') ? 'mg/m³' : 'µg/m³';

    // Value
    r.value = Number(r.pollutant_avg);
    delete r.pollutant_avg;

    // Date
    const date = moment.tz(r.last_update, 'DD-MM-YYYY HH:mm:ss', 'Asia/Kolkata');
    r.date = {utc: date.toDate(), local: date.format()};
    delete r.last_update;

    // Coorindates
    r.coordinates = coords[r.location];

    r.averagingPeriod = {unit: 'hours', value: 1};
    r.attribution = [{
      name: 'Central Pollution Control Board',
      url: 'https://app.cpcbccr.com/ccr/#/caaqm-dashboard-all/caaqm-landing'
    }, {
      name: 'data.gov.in',
      url: 'https://data.gov.in/resources/real-time-air-quality-index-various-locations'
    }];

    return r;
  }).filter((r) => {
    // Make sure we're only getting parameters of interest
    return acceptableParameters.includes(r.parameter);
  }).filter((r) => {
    // Make sure values are numbers
    return !isNaN(r.value);
  });

  // Be kind, convert units
  results = convertUnits(results);

  return {
    name: 'unused',
    measurements: results
  };
};

// Dump of coordinates from https://app.cpcbccr.com/ccr/#/caaqm-dashboard-all/caaqm-landing
const coords = {
  'Lodhi Road, New Delhi - IMD': { latitude: 28.5918245, longitude: 77.2273074 },
  'Sector - 125, Noida, UP - UPPCB': { latitude: 28.5447608, longitude: 77.3231257 },
  'CRRI Mathura Road, New Delhi - IMD': { latitude: 28.5512005, longitude: 77.2735737 },
  'Burari Crossing, New Delhi - IMD': { latitude: 28.7256504, longitude: 77.2011573 },
  'ITO, New Delhi - CPCB': { latitude: 28.6316945, longitude: 77.2494387 },
  'Pusa, New Delhi - IMD': { latitude: 28.610304, longitude: 77.0996943 },
  'DTU, New Delhi - CPCB': { latitude: 28.7500499, longitude: 77.1112615 },
  'North Campus, DU, New Delhi - IMD': { latitude: 28.6573814, longitude: 77.1585447 },
  'Shadipur, New Delhi - CPCB': { latitude: 28.6514781, longitude: 77.1473105 },
  'Aya Nagar, New Delhi - IMD': { latitude: 28.4706914, longitude: 77.1099364 },
  'Vasundhara, Ghaziabad, UP - UPPCB': { latitude: 28.6603346, longitude: 77.3572563 },
  'NSIT Dwarka, New Delhi - CPCB': { latitude: 28.60909, longitude: 77.0325413 },
  'Sector - 62, Noida, UP - IMD': { latitude: 28.6245479, longitude: 77.3577104 },
  'IHBAS, Dilshad Garden,New Delhi - CPCB': { latitude: 28.6802747, longitude: 77.2011573 },
  'BWSSB Kadabesanahalli, Bengaluru - CPCB': { latitude: 12.9352049, longitude: 77.6814488 },
  'Vikas Sadan, Gurgaon, Haryana - HSPCB': { latitude: 28.4501238, longitude: 77.0263051 },
  'Police Commissionerate, Jaipur - RSPCB': { latitude: 26.9164092, longitude: 75.7994901 },
  'IGI Airport Terminal - 3, New Delhi - IMD': { latitude: 28.5627763, longitude: 77.1180053 },
  'ICRISAT Patancheru, Hyderabad - TSPCB': { latitude: 17.4342359, longitude: 78.4170318 },
  'Sirifort, New Delhi - CPCB': { latitude: 28.5504249, longitude: 77.2159377 },
  'Plammoodu, Thiruvananthapuram - Kerala PCB': { latitude: 8.5149093, longitude: 76.9435879 },
  'Punjab Agricultural University, Ludhiana - PPCB': { latitude: 30.9028, longitude: 75.8086 },
  'Tata Stadium, Jorapokhar - JSPCB': { latitude: 23.707909, longitude: 86.41467 },
  'RIMT University, Mandi Gobindgarh - PPCB': { latitude: 30.649961, longitude: 76.331442 },
  'Golden Temple, Amritsar - PPCB': { latitude: 31.62, longitude: 74.876512 },
  'PWD Grounds, Vijayawada - APPCB': { latitude: 16.507014, longitude: 80.627767 },
  'Tirumala, Tirupati - APPCB': { latitude: 13.67, longitude: 79.35 },
  'APIIC Kancharapalem, Visakhapatnam - APPCB': { latitude: 17.738569, longitude: 83.264656 },
  'GVM Corporation, Visakhapatnam - APPCB': { latitude: 17.72, longitude: 83.3 },
  'Airoli, Navi Mumbai - MPCB': { latitude: 19.1494, longitude: 72.9986 },
  'Central University, Hyderabad - TSPCB': { latitude: 17.460103, longitude: 78.334361 },
  'Peenya, Bengaluru - CPCB': { latitude: 13.0270199, longitude: 77.494094 },
  'MD University, Rohtak, Haryana - HSPCB': { latitude: 28.870083, longitude: 76.6205 },
  'City Railway Station, Bengaluru - KSPCB': { latitude: 12.9756843, longitude: 77.5660749 },
  'Sanegurava Halli, Bengaluru - KSPCB': { latitude: 12.990328, longitude: 77.5431385 },
  'Sector- 16A, Faridabad, Haryana - HSPCB': { latitude: 28.4088421, longitude: 77.3099081 },
  'More Chowk Waluj, Aurangabad - MPCB': { latitude: 19.8389439, longitude: 75.244448 },
  'Chandrapur, Chandrapur - MPCB': { latitude: 19.645324, longitude: 77.6345232 },
  'Bandra, Mumbai - MPCB': { latitude: 19.041847, longitude: 72.865513 },
  'Bollaram Industrial Area, Hyderabad - TSPCB': { latitude: 17.540891, longitude: 78.358528 },
  'BTM Layout, Bengaluru - CPCB': { latitude: 12.9135218, longitude: 77.5950804 },
  'Collectorate, Jodhpur - RSPCB': { latitude: 26.268249, longitude: 73.0193853 },
  'Collectorate, Gaya - BSPCB': { latitude: 24.7955, longitude: 84.9994 },
  'East Arjun Nagar, Delhi - CPCB': { latitude: 28.6556017, longitude: 77.2859318 },
  'Mandir Marg, New Delhi - DPCC': { latitude: 28.6372688, longitude: 77.2005604 },
  'Muzaffarpur Collectorate,Muzaffarpur - BSPCB': { latitude: 26.1209, longitude: 85.3647 },
  'Punjabi Bagh, New Delhi - DPCC': { latitude: 28.6670856, longitude: 77.1301247 },
  'R K Puram, New Delhi - DPCC': { latitude: 28.5646102, longitude: 77.1670103 },
  'Sector-6, Panchkula - HSPCB ': { latitude: 30.7057778, longitude: 76.8531805555555 },
  'IGSC Planetarium Complex, Patna - BSPCB': { latitude: 25.5941, longitude: 85.1376 },
  'Central School, Lucknow - CPCB': { latitude: 26.8821003, longitude: 80.9302753 },
  'Ardhali Bazar, Varanasi - UPPCB': { latitude: 25.3505986, longitude: 82.9083074 },
  'Howrah, Howrah - WBPCB': { latitude: 22.5565568, longitude: 87.895755 },
  'IDA Pashamylaram, Hyderabad - TSPCB': { latitude: 17.5316895, longitude: 78.218939 },
  'Nehru Nagar, Kanpur - UPPCB': { latitude: 26.4703136, longitude: 80.3229863 },
  'Lalbagh, Lucknow - CPCB': { latitude: 26.8458805, longitude: 80.9365541 },
  'IIT, Chennai - CPCB': { latitude: 13.0052189, longitude: 80.2398125 },
  'Karve Road Pune, Pune - MPCB': { latitude: 18.5011743, longitude: 73.8165527 },
  'Alandur Bus Depot, Chennai - CPCB': { latitude: 12.9099161, longitude: 80.1076538 },
  'Sanathnagar, Hyderabad - TSPCB': { latitude: 17.4559458, longitude: 78.4332152 },
  'MIDC Khutala, Chandrapur - MPCB': { latitude: 19.9775302, longitude: 79.2337086 },
  'Rabindra Bharati University, Kolkata - WBPCB': { latitude: 22.5824635, longitude: 88.3572447 },
  'Talkatora District Industries Center, Lucknow - CPCB': { latitude: 26.83399722, longitude: 80.8917361 },
  'Zoo Park, Hyderabad - TSPCB': { latitude: 17.349694, longitude: 78.451437 },
  'Sidhu Kanhu Indoor Stadium, Durgapur - WBPCB': { latitude: 23.5404352, longitude: 87.2892225 },
  'Haldia, Haldia - WBPCB': { latitude: 22.06047, longitude: 88.109737 },
  'Anand Vihar, New Delhi - DPCC': { latitude: 28.6527398, longitude: 77.2977933 },
  'Solapur, Solapur - MPCB': { latitude: 17.6599188, longitude: 75.9063906 },
  'Opp GPO Civil Lines, Nagpur - MPCB': { latitude: 21.152875, longitude: 79.0517531 },
  'Gangapur Road, Nashik - MPCB': { latitude: 20.0073285, longitude: 73.7762427 },
  'Pimpleshwar Mandir, Thane - MPCB': { latitude: 19.192056, longitude: 72.9585188 },
  'Manali, Chennai - CPCB': { latitude: 13.164544, longitude: 80.26285 },
  'Sanjay Palace, Agra - UPPCB': { latitude: 27.19865833, longitude: 78.00598056 },
  'Maninagar, Ahmedabad - GPCB': { latitude: 23.002657, longitude: 72.591912 },
  'Victoria, Kolkata - WBPCB': { latitude: 22.5448082, longitude: 88.3403691 },
  'Moti Doongri, Alwar, Rajasthan - RSPCB': { latitude: 27.554793, longitude: 76.611536 },
  'RIICO Ind. Area III, Bhiwadi, Rajasthan - RSPCB': { latitude: 28.194909, longitude: 76.862296 },
  'Civil Lines,  Ajmer - RSPCB': { latitude: 26.470859, longitude: 74.646594 },
  'Adarsh Nagar, Jaipur - RSPCB': { latitude: 26.902909, longitude: 75.836853 },
  'Shrinath Puram, Kota - RSPCB': { latitude: 25.14389, longitude: 75.821256 },
  'Indira Colony Vistar, Pali - RSPCB': { latitude: 25.771061, longitude: 73.340227 },
  'Shastri Nagar, Jaipur - RSPCB': { latitude: 26.9502929, longitude: 75.730943 },
  'Ashok Nagar, Udaipur - RSPCB': { latitude: 24.5886166, longitude: 73.6321397 },
  'Lajpat Nagar, Moradabad - UPPCB': { latitude: 28.825341, longitude: 78.7213009 },
  'Anand Kala Kshetram, Rajamahendravaram - APPCB': { latitude: 16.9872867, longitude: 81.7363176 },
  'Mahakaleshwar Temple, Ujjain - MPPCB': { latitude: 23.182719, longitude: 75.768218 },
  'Vindhyachal STPS, Singrauli - MPPCB': { latitude: 24.10897, longitude: 82.64558 },
  'Sector-2 Industrial Area, Pithampur - MPPCB': { latitude: 22.624758, longitude: 75.675238 },
  'Sector-D Industrial Area, Mandideep - MPPCB': { latitude: 23.10844, longitude: 77.511428 },
  'Bhopal Chauraha, Dewas - MPPCB': { latitude: 22.9682591, longitude: 76.064118 },
  'Nishant Ganj, Lucknow - UPPCB': { latitude: 26.871428, longitude: 80.957145 },
  'Secretariat, Amaravati - APPCB': { latitude: 16.5150833, longitude: 80.5181667 },
  'Talcher Coalfields,Talcher - OSPCB': { latitude: 20.9360711, longitude: 85.1707021 },
  'GM Office, Brajrajnagar - OSPCB': { latitude: 21.8004996, longitude: 83.8396977 },
  'Padmapukur, Howrah - WBPCB': { latitude: 22.5687319, longitude: 88.2797276 },
  'Asanol Court Area, Asanol - WBPCB': { latitude: 23.685297, longitude: 86.945968 },
  'Ward-32 Bapupara, Siliguri - WBPCB': { latitude: 26.6883049, longitude: 88.412668 },
  'Birla Staff colony, Satna - MPPCB': { latitude: 24.5908256, longitude: 80.8574279 },
  'Model Town, Patiala - PPCB': { latitude: 30.349388, longitude: 76.366642 },
  'Civil Line, Jalandhar - PPCB': { latitude: 31.321907, longitude: 75.578914 } };
