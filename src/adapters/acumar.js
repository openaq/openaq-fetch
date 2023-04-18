import got from 'got';
import { load } from 'cheerio';

const ACUMAR_URL = 'http://jmb.acumar.gov.ar/calidad/contaminantes.php';
export const name = 'acumar-ar';

export async function getPollutionData() {
  try {
    const response = await got(ACUMAR_URL);
    const $ = load(response.body);

    const data = [];

    // Find the table and loop through its rows
    $('table')
      .eq(1) // Change to 1 to target the second table
      .find('tr')
      .each((i, row) => {
        if (i === 0) return; // Skip the header row

        const rowData = {
          date: '',
          time: '',
          no2: null,
          no: null,
          nox: null,
          o3: null,
          pm10: null,
          pm25: null,
          so2: null,
          co: null,
        };

        // Loop through the row's cells and extract data
        $(row)
          .find('td')
          .each((j, cell) => {
            const value = $(cell).text().trim();

            switch (j) {
              case 0:
                rowData.date = value;
                break;
              case 1:
                rowData.time = value;
                break;
              case 2:
                rowData.no2 = parseFloat(value);
                break;
              case 3:
                rowData.no = parseFloat(value);
                break;
              case 4:
                rowData.nox = parseFloat(value);
                break;
              case 5:
                rowData.o3 = parseFloat(value);
                break;
              case 6:
                rowData.pm10 = parseFloat(value);
                break;
              case 7:
                rowData.pm25 = parseFloat(value);
                break;
              case 8:
                rowData.so2 = parseFloat(value);
                break;
              case 9:
                rowData.co = parseFloat(value);
                break;
              default:
                break;
            }
          });

        data.push(rowData);
      });

    console.log(data);
  } catch (error) {
    console.error(`Error fetching data: ${error.message}`);
  }
}

getPollutionData();
