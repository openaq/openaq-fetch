import puppeteer from 'puppeteer';
import { DateTime } from 'luxon';

const now = DateTime.now();
const start = now.minus({ hours: 4 });
const startTime = start.toFormat('yyyy-MM-dd HH:mm');
const endTime = now.toFormat('yyyy-MM-dd HH:mm');

const concParams = ['CO', 'NO2', 'O3', 'SO2'];
const metParams = ['PM25', 'RH'];

export const name = 'delhi';

export async function fetchData(source, cb) {
    const browser = await puppeteer.launch({ headless: true });
    try {
      const stations = await getStations(browser);
      console.dir(stations, { depth: null });
      const allData = [];
      for (const station of stations) {
        const concUrl = `${source.url}AallAdvanceSearchCconc.php?stName=${station.stName}`;
        const metUrl = `${source.url}AallAdvanceSearchMet.php?stName=${station.stName}`;
        const [conc, met] = await Promise.all([
          fetchHighchartsData(browser, concUrl, concParams, startTime, endTime),
          fetchHighchartsData(browser, metUrl, metParams, startTime, endTime),
        ]);
        allData.push({ ...station, conc, met });
      }
      const formattedData = formatData(allData, startTime, endTime);
      console.dir(formattedData, { depth: null });
      cb(null, { name: 'unused', measurements: formattedData });
    } finally {
      await browser.close();
    }
  }
  
async function fetchParameterData (browser, url, parameterValue, startTime, endTime) {
  let page;
  try {
    const context = await browser.createIncognitoBrowserContext();
    page = await context.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // await page.goto(url, { waitUntil: 'networkidle0' });
    await page.select('select[name="parameters"]', parameterValue);
    await page.evaluate((startTime, endTime) => {
      document.querySelector('input[name="fDate"]').value = startTime;
      document.querySelector('input[name="eDate"]').value = endTime;
    }, startTime, endTime);

    await Promise.all([
      page.click('input[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }),
    ]);

    const highchartsData = await page.evaluate(() => {
      const chart = Highcharts.charts.find(chart => chart && chart.series && chart.series.length > 0);
      return chart ? chart.series.map(series => ({ name: series.name, data: series.options.data })) : null;
    });

    return { parameterValue, highchartsData };
  } catch (error) {
    console.error(`Error fetching data for ${parameterValue}:`, error);
    return { parameterValue, highchartsData: null };
  } finally {
    if (page) await page.close();
  }
}

async function fetchHighchartsData (browser, url, parameterValues, startTime, endTime) {
  const dataPromises = parameterValues.map(parameterValue => 
    fetchParameterData(browser, url, parameterValue, startTime, endTime)
  );

  const results = await Promise.all(dataPromises);
  return results.reduce((acc, { parameterValue, highchartsData }) => {
    acc[parameterValue] = highchartsData;
    return acc;
  }, {});
}

async function getStations (browser) {
  const page = await browser.newPage();
  await page.goto('https://www.dpccairdata.com/dpccairdata/display/index.php', { waitUntil: 'networkidle0' });

  const formattedStations = await page.evaluate(() => {
    return locations.map(location => ({
      name: location[0],
      latitude: location[1],
      longitude: location[2],
      url: location[3],
      stName: location[3].split('=')[1],
      imageUrl: location[4],
      displayName: location[5]
    }));
  });

  await page.close();
  return formattedStations;
}

function formatData (stations, startTime, endTime) {
  const measurements = [];
  const startDateTime = DateTime.fromFormat(startTime, 'yyyy-MM-dd HH:mm');
  const endDateTime = DateTime.fromFormat(endTime, 'yyyy-MM-dd HH:mm');

  stations.forEach(station => {
    ['conc', 'met'].forEach(paramType => {
      if (station[paramType]) {
        Object.keys(station[paramType]).forEach(pollutant => {
          station[paramType][pollutant].forEach(measurementSeries => {
            measurementSeries.data.forEach((value, index) => {
              if (value !== null) {
                const measurementTime = startDateTime.plus({ hours: index });
                const measurement = {
                  location: station.name,
                //   parameter: measurementSeries.name,
                  parameter: pollutant.toLowerCase() === 'rh' ? 'relativehumidity' : pollutant.toLowerCase(),
                  date: {
                    utc: measurementTime.toUTC().toISO({suppressMilliseconds: true}),
                    local: measurementTime.toISO({suppressMilliseconds: true}),
                  },
                  coordinates: {
                    longitude: station.longitude,
                    latitude: station.latitude,
                  },
                  value: value,
                  unit: pollutant.toLowerCase() === 'rh' ? '%' : 'µg/m³',
                  attribution: [
                    { name: 'Delhi NCT', url: 'http://www.dpccairdata.com/dpccairdata/display/index.php' },
                  ],
                  averagingPeriod: {
                    unit: 'hours',
                    value: 1,
                  },
                };
                measurements.push(measurement);
              }
            });
          });
        });
      }
    });
  });

  return measurements;
}
