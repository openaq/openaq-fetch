import puppeteer from 'puppeteer';
import { DateTime } from 'luxon';
import log from '../lib/logger.js';

const timeZone = 'Asia/Kolkata';

const now = DateTime.now().setZone(timeZone);
const start = now.minus({ hours: 12 }); // overfetch offset
const timeRange = {
  startTime: start.toFormat('yyyy-MM-dd HH:mm'),
  endTime: now.toFormat('yyyy-MM-dd HH:mm')
};
const baseUrl = 'https://www.dpccairdata.com/dpccairdata/display/';
const stationsUrl = 'https://www.dpccairdata.com/dpccairdata/display/index.php';

const concParams = ['CO', 'NO2', 'O3', 'SO2']; // additional params: 'NO1', 'NOX'
const metParams = ['PM25', 'RH'];

export const name = 'delhi';

/**
 * Fetches pollution and meteorological data for each station.
 * @param {string} source - The data source to fetch from.
 * @param {function} cb - Callback function to execute with the fetched and formatted data.
 */
export async function fetchData(source, cb) {
    const browser = await puppeteer.launch({ headless: 'shell' });
    const stations = await fetchStations(browser);
  
    const results = await Promise.all(stations.map(async (station) => {
      const concUrl = `${baseUrl}AallAdvanceSearchCconc.php?stName=${station.stName}`;
      const metUrl = `${baseUrl}AallAdvanceSearchMet.php?stName=${station.stName}`;
  
      try {
        const [concData, metData] = await Promise.all([
          fetchAllParametersData(browser, concUrl, concParams, timeRange),
          fetchAllParametersData(browser, metUrl, metParams, timeRange),
        ]);
        return { ...station, concData, metData };
      } catch (error) {
        return { ...station, error: error.message };
      }
    }));
    const formattedData = formatData(results, timeRange.startTime);
    log.debug('Delhi data:', formattedData[0]);
    cb(null, { name: 'unused', measurements: formattedData }); 
    await browser.close();
  }
  
/**
 * Configures a Puppeteer page by setting up request interception to block unnecessary resources
 * such as images, stylesheets, and fonts to improve page loading performance.
 * @param {Object} page - The Puppeteer page object to configure.
 */
async function configurePage(page) {
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });
}

/**
 * Handles navigation and form interaction within a Puppeteer browser context.
 * @param {Object} browser - The Puppeteer browser instance to use for the page creation.
 * @param {string} url - The URL to navigate to for fetching the parameter data.
 * @param {string} parameter - The parameter to fetch data for.
 * @param {Object} timeRange - An object containing startTime and endTime for the data fetch.
 * @returns {Object} An object containing the parameter name and the fetched data.
 */
async function fetchParameterData(browser, url, parameter, { startTime, endTime }) {
  log.debug("Fetching parameter data:", parameter);
  const page = await browser.newPage();
  try {
    await configurePage(page);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.select('select[name="parameters"]', parameter);
    await page.evaluate((startTime, endTime) => {
      document.querySelector('input[name="fDate"]').value = startTime;
      document.querySelector('input[name="eDate"]').value = endTime;
    }, startTime, endTime);

    await Promise.all([
      page.click('input[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
    ]);

    const data = await page.evaluate(() => {
      const chart = Highcharts.charts.find(chart => chart?.series?.length > 0);
      return chart ? chart.series.map(series => ({
        name: series.name,
        data: series.options.data
      })) : null;
    });

    return { parameter, data };
  } catch (error) {
    log.debug(`Error fetching data for ${parameter}:`, error)
    return { parameter, data: null };
  } finally {
    await page.close();
  }
}

/**
 * Fetches data for all specified parameters by initiating multiple fetchParameterData calls in parallel.
 * @param {Object} browser - The Puppeteer browser instance used for fetching data.
 * @param {string} url - The URL to use for data fetching specific to each station.
 * @param {Array} parameters - An array of parameters to fetch data for.
 * @param {Object} timeRange - An object containing startTime and endTime for the data fetch.
 * @returns {Object} An aggregated object of all fetched parameters data.
 */
async function fetchAllParametersData(browser, url, parameters, timeRange) {
  const dataPromises = parameters.map(parameter =>
    fetchParameterData(browser, url, parameter, timeRange)
  );
  const results = await Promise.all(dataPromises);
  return results.reduce((acc, { parameter, data }) => {
    acc[parameter] = data;
    return acc;
  }, {});
}

/**
 * Fetches station information from the Delhi Pollution Control Committee website.
 * @param {Object} browser - The Puppeteer browser instance used for navigating to the station information URL.
 * @returns {Array} An array of objects, each representing a station and its data.
 */
async function fetchStations(browser) {
  log.debug("Fetching stations");
  const page = await browser.newPage();
  await page.goto(stationsUrl, { waitUntil: 'networkidle0' });

  const stations = await page.evaluate(() => locations.map(location => ({
    name: location[0],
    latitude: location[1],
    longitude: location[2],
    url: location[3],
    stName: location[3].split('=')[1],
    imageUrl: location[4],
    displayName: location[5]
  })));

  await page.close();
  log.debug("Fetched", stations);
  return stations;
}

/**
 * Formats the fetched station and measurement data 
 * @param {Array} stations - An array of station objects with fetched data.
 * @param {string} startTime - The start time for the data fetch, in 'yyyy-MM-dd HH:mm' format.
 * @param {string} endTime - The end time for the data fetch, in 'yyyy-MM-dd HH:mm' format.
 * @returns {Array} An array of formatted measurement objects.
 */
function formatData(stations, startTime) {
    const measurements = [];
    const startDateTime = DateTime.fromFormat(startTime, 'yyyy-MM-dd HH:mm',  { zone: 'Asia/Kolkata' });
  
    stations.forEach(station => {
      ['concData', 'metData'].forEach(paramType => {
        if (station[paramType]) {
          Object.keys(station[paramType]).forEach(pollutant => {
            const measurementSeries = station[paramType][pollutant];
            if (measurementSeries) {
              measurementSeries.forEach(dataPoint => {
                dataPoint.data.forEach((value, index) => {
                  if (value !== null) {
                    const measurementTime = startDateTime.plus({ hours: index });
                    const measurement = {
                      location: station.name,
                      city: " ",
                      parameter: pollutant.toLowerCase() === 'rh' ? 'relativehumidity' : pollutant.toLowerCase(),
                      date: {
                        utc: measurementTime.toUTC().toISO({ suppressMilliseconds: true }),
                        local: measurementTime.toISO({ suppressMilliseconds: true}),
                      },
                      coordinates: {
                          latitude: station.latitude,
                          longitude: station.longitude,
                      },
                      averagingPeriod: { unit: 'hours', value: 1 },
                      attribution: [{
                        name: 'Delhi Pollution Control Committee',
                        url: 'http://www.dpccairdata.com/dpccairdata/display/index.php'
                      }],
                      value: value,
                      unit: pollutant.toLowerCase() === 'rh' ?  '%' : 'µg/m³',
                    };
                    measurements.push(measurement);
                  }
                });
              });
            }
          });
        }
      });
    });
  
    return measurements;
  }
  
