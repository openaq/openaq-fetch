import got from 'got';
import { parse } from 'csv-parse';

const slugs = [
  'AEAZ',
  'ARCB',
  'AUMN',
  'BDDU',
  'BIBU',
  'CADO',
  'CAHA',
  'CAKE',
  'CALE',
  'CASH',
  'CHTS',
  'CLST',
  'CODC',
  'ETAD',
  'IDBD',
  'ILHA',
  'ILNZ',
  'INDH',
  'INKA',
  'KRSE',
  'KRUL',
  'MXMC',
  'NGIL',
  'PHMO',
  'PRFJ',
  'SGSU',
  'TWKA',
  'TWTA',
  'USBA',
  'USBO',
  'USMC',
  'USNO',
  'USPA',
  'VNHN',
  'ZAJB',
  'ZAPR',
];

async function fetchData(slug) {
  const csvUrl = `http://data.spartan-network.org/GroupedBySite/${slug}/TimeResPM25_HourlyEstPM25_${slug}.csv`;

  try {
    const response = await got(csvUrl);
    const parser = parse(
      response.body,
      { columns: true, skip_empty_lines: true, from_line: 2 },
      (err, records) => {
        if (err) {
          console.error('Error parsing CSV:', err);
          return;
        }

        // Print column names
        if (records.length > 0) {
          console.log('Column names:', Object.keys(records[0]));
        } else {
          console.log('No data found in the CSV.');
        }
      }
    );
  } catch (error) {
    console.error('Error fetching CSV:', error);
  }
}

// Example usage
fetchData(slugs[0]);

const handledSlugs = [
  'IDBD',
  'ARCB',
  'BDDU',
  'USEM',
  'INKA',
  'USMC',
  'PHMO',
  'ILNZ',
  'CHTS',
  'NGIL',
  'ZAPR',
  'SGSU',
  'VNHN',
];

const missingSlugs = slugs.filter(
  (slug) => !handledSlugs.includes(slug)
);

console.log('Missing slugs:', missingSlugs);
