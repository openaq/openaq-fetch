import got from 'got';
import { parse } from 'csv-parse';
import { DateTime } from 'luxon';

const slugs = [ 
  'AEAZ',
  // 'ARCB',
  // 'AUMN',
  // 'BDDU',
  // 'BIBU',
  // 'CADO',
  // 'CAHA',
  // 'CAKE',
  // 'CALE',
  // 'CASH',
  // 'CHTS',
  // 'CLST',
  // 'CODC',
  // 'ETAD',
  // 'IDBD',
  // 'ILHA',
  // 'ILNZ',
  // 'INDH',
  // 'INKA',
  // 'KRSE',
  // 'KRUL',
  // 'MXMC',
  // 'NGIL',
  // 'PHMO',
  // 'PRFJ',
  // 'SGSU',
  // 'TWKA',
  // 'TWTA',
  // 'USBA',
  // 'USBO',
  // 'USMC',
  // 'USPA',
  // 'VNHN',
  // 'ZAJB',
  // 'ZAPR',
];

async function fetchData(slug) {
  const csvUrl = `http://data.spartan-network.org/GroupedBySite/${slug}/TimeResPM25_HourlyEstPM25_${slug}.csv`;

  try {
    const response = await got(csvUrl);
    return new Promise((resolve, reject) => {
      parse(
        response.body,
        { columns: true, skip_empty_lines: true, from_line: 2 },
        (err, records) => {
          if (err) {
            console.error('Error parsing CSV:', err);
          } else {
            const formattedRecords = records
              .slice(1)
              .map((record) => {
                const date = getDate(
                  `${record.Year_local}/${
                    record.Month_local
                  }/${String(record.Day_local).padStart(
                    2,
                    '0'
                  )} ${String(record.hour_local).padStart(2, '0')}`,
                  slug
                );
                const location = getLocation(slug);

                return {
                  parameter: 'pm25',
                  value: parseFloat(record.Value),
                  units: 'µg/m³',
                  location: location.location,
                  city: location.city,
                  date,
                  coordinates: {
                    latitude: parseFloat(record.Latitude),
                    longitude: parseFloat(record.Longitude),
                  },
                  attribution: [
                    {
                      name: 'spartan-network',
                      url: 'http://data.spartan-network.org/',
                    },
                  ],
                  averagingPeriod: { unit: 'hours', value: 1 },
                };
              });

            resolve(formattedRecords);
          }
        }
      );
    });
  } catch (error) {
    console.error(error);
  }
}

(async () => {
  for (const slug of slugs) {
    const stationData = await fetchData(slug);
    console.log(stationData);
  }
})();

const getLocation = function (location) {
  switch (location) {
    case 'INKA':
      return {
        location: 'SPARTAN - IIT Kanpur',
        city: 'Kanpur',
        country: 'IN',
      };
    case 'CHTS':
      return {
        location: 'SPARTAN - Tsinghua University',
        city: 'Beijing',
        country: 'CN',
      };
    case 'BDDU':
      return {
        location: 'SPARTAN - Dhaka University',
        city: 'Dhaka',
        country: 'BD',
      };
    case 'USEM':
      return {
        location: 'SPARTAN - Emory University',
        city: 'Atlanta',
        country: 'US',
      };
    case 'USMC':
      return {
        location: 'SPARTAN - Mammoth Cave',
        city: 'Mammoth Cave NP',
        country: 'US',
      };
    case 'PHMO':
      return {
        location: 'SPARTAN - Manila Observatory',
        city: 'Manila',
        country: 'PH',
      };
    case 'ARCB':
      return {
        location: 'SPARTAN - CITEDEF',
        city: 'Buenos Aires',
        country: 'AR',
      };
    case 'NGIL':
      return {
        location: 'SPARTAN - Ilorin University',
        city: 'Ilorin',
        country: 'NG',
      };
    case 'IDBD':
      return {
        location: 'SPARTAN - ITB Bandung',
        city: 'Bandung',
        country: 'ID',
      };
    case 'VNHN':
      return {
        location: 'SPARTAN - Vietnam Acad. Sci.',
        city: 'Hanoi',
        country: 'VN',
      };
    case 'SGSU':
      return {
        location: 'SPARTAN - NUS',
        city: 'Singapore',
        country: 'SG',
      };
    case 'ILNZ':
      return {
        location: 'SPARTAN - Weizmann Institute',
        city: 'Rehovot',
        country: 'IL',
      };
    case 'ZAPR':
      return {
        location: 'SPARTAN - CSIR',
        city: 'Pretoria',
        country: 'ZA',
      };
    case 'AEAZ':
      return {
        location: 'SPARTAN - Abu Dhabi',
        city: 'Abu Dhabi',
        country: 'AE',
      };
    case 'AUMN':
      return {
        location: 'SPARTAN - Melbourne',
        city: 'Melbourne',
        country: 'AU',
      };
    case 'BIBU':
      return {
        location: 'SPARTAN - Bujumbura',
        city: 'Bujumbura',
        country: 'BI',
      };
    case 'CADO':
      return {
        location: 'SPARTAN - Downsview',
        city: 'Toronto',
        country: 'CA',
      };
    case 'CAHA':
      return {
        location: 'SPARTAN - Halifax',
        city: 'Halifax',
        country: 'CA',
      };
    case 'CAKE':
      return {
        location: 'SPARTAN - Kelowna',
        city: 'Kelowna',
        country: 'CA',
      };
    case 'CALE':
      return {
        location: 'SPARTAN - Lethbridge',
        city: 'Lethbridge',
        country: 'CA',
      };
    case 'CASH':
      return {
        location: 'SPARTAN - Sherbrooke',
        city: 'Sherbrooke',
        country: 'CA',
      };
    case 'CLST':
      return {
        location: 'SPARTAN - Santiago',
        city: 'Santiago',
        country: 'CL',
      };
    case 'CODC':
      return {
        location: 'SPARTAN - Palmira',
        city: 'Palmira',
        country: 'CO',
      };
    case 'ETAD':
      return {
        location: 'SPARTAN - Addis Ababa',
        city: 'Addis Ababa',
        country: 'ET',
      };
    case 'ILHA':
      return {
        location: 'SPARTAN - Haifa',
        city: 'Haifa',
        country: 'IL',
      };
    case 'INDH':
      return {
        location: 'SPARTAN - Delhi',
        city: 'Delhi',
        country: 'IN',
      };
    case 'KRSE':
      return {
        location: 'SPARTAN - Seoul',
        city: 'Seoul',
        country: 'KR',
      };
    case 'KRUL':
      return {
        location: 'SPARTAN - Ulsan',
        city: 'Ulsan',
        country: 'KR',
      };
    case 'MXMC':
      return {
        location: 'SPARTAN - Mexico City',
        city: 'Mexico City',
        country: 'MX',
      };
    case 'PRFJ':
      return {
        location: 'SPARTAN - Fajardo',
        city: 'Fajardo',
        country: 'PR',
      };
    case 'TWKA':
      return {
        location: 'SPARTAN - Kaohsiung',
        city: 'Kaohsiung',
        country: 'TW',
      };
    case 'TWTA':
      return {
        location: 'SPARTAN - Taipei',
        city: 'Taipei',
        country: 'TW',
      };
    case 'USBA':
      return {
        location: 'SPARTAN - Baltimore',
        city: 'Baltimore',
        country: 'US',
      };
    case 'USBO':
      return {
        location: 'SPARTAN - Bondville',
        city: 'Bondville',
        country: 'US',
      };
    case 'USPA':
      return {
        location: 'SPARTAN - Pasadena',
        city: 'Pasadena',
        country: 'US',
      };
    case 'ZAJB':
      return {
        location: 'SPARTAN - Johannesburg',
        city: 'Johannesburg',
        country: 'ZA',
      };
    default:
      return {
        location: 'Unknown',
        city: 'Unknown',
        country: 'Unknown',
      };
  }
};

const getDate = function (dateString, location) {
  const getTZ = function (location) {
    switch (location) {
      case 'AEAZ':
        return 'Asia/Dubai';
      case 'AUMN':
        return 'Australia/Melbourne';
      case 'BIBU':
        return 'Africa/Bujumbura';
      case 'CADO':
        return 'America/Toronto';
      case 'CAHA':
        return 'America/Halifax';
      case 'CAKE':
        return 'America/Vancouver';
      case 'CALE':
        return 'America/Edmonton';
      case 'CASH':
        return 'America/Toronto';
      case 'CLST':
        return 'America/Santiago';
      case 'CODC':
        return 'America/Bogota';
      case 'ETAD':
        return 'Africa/Addis_Ababa';
      case 'ILHA':
        return 'Asia/Jerusalem';
      case 'INDH':
        return 'Asia/Kolkata';
      case 'KRSE':
        return 'Asia/Seoul';
      case 'KRUL':
        return 'Asia/Seoul';
      case 'MXMC':
        return 'America/Mexico_City';
      case 'PRFJ':
        return 'America/Puerto_Rico';
      case 'TWKA':
        return 'Asia/Taipei';
      case 'TWTA':
        return 'Asia/Taipei';
      case 'USBA':
        return 'America/New_York';
      case 'USBO':
        return 'America/Chicago';
      case 'USPA':
        return 'America/Los_Angeles';
      case 'ZAJB':
        return 'Africa/Johannesburg';
      case 'IDBD':
        return 'Asia/Jakarta';
      case 'ARCB':
        return 'America/Argentina/Buenos_Aires';
      case 'BDDU':
        return 'Asia/Dhaka';
      case 'USEM':
        return 'US/Eastern';
      case 'INKA':
        return 'Asia/Kolkata';
      case 'USMC':
        return 'US/Eastern';
      case 'PHMO':
        return 'Asia/Manila';
      case 'ILNZ':
        return 'Asia/Jerusalem';
      case 'CHTS':
        return 'Asia/Shanghai';
      case 'NGIL':
        return 'Africa/Lagos';
      case 'ZAPR':
        return 'Africa/Johannesburg';
      case 'SGSU':
        return 'Asia/Singapore';
      case 'VNHN':
        return 'Asia/Ho_Chi_Minh';
      default:
        return 'utc';
    }
  };
  const date = DateTime.fromFormat(
    dateString,
    'yyyy/MM/dd HH',
    getTZ(location)
  );

  return {
    utc: date.toUTC().toISO({ suppressMilliseconds: true }),
    local: date.toISO({ suppressMilliseconds: true }),
  };
};

const columnNames = [
  'Site_Code',
  'Country',
  'City',
  'Latitude',
  'Longitude',
  'Elevation_meters',
  'Year_local',
  'Month_local',
  'Day_local',
  'hour_local',
  'Parameter_Code',
  'Parameter_Name',
  'Value',
  'Units',
  'Method_Code',
  'Collection_Description',
  'Analysis_Description',
  'Conditions',
];

const missingSlugs = [
  'AEAZ',
  'AUMN',
  'BIBU',
  'CADO',
  'CAHA',
  'CAKE',
  'CALE',
  'CASH',
  'CLST',
  'CODC',
  'ETAD',
  'ILHA',
  'INDH',
  'KRSE',
  'KRUL',
  'MXMC',
  'PRFJ',
  'TWKA',
  'TWTA',
  'USBA',
  'USBO',
  'USNO',
  'USPA',
  'ZAJB',
];
