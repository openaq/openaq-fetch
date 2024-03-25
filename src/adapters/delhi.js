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
const baseUrl = 'https://www.dpccairdata.com/dpccairdata/display';
const stationsUrl = 'https://www.dpccairdata.com/dpccairdata/display/index.php';

export const name = 'delhi';

export const parameters = {
    'CO': { name: 'co', unit: 'mg/m3', file: 'AallAdvanceSearchCconc.php' },
    'NO2': { name: 'no2', unit: 'ug/m3', file: 'AallAdvanceSearchCconc.php' },
    'O3': { name: 'o3', unit: 'ug/m3', file: 'AallAdvanceSearchCconc.php' },
    'SO2': { name: 'so2', unit: 'ug/m3', file: 'AallAdvanceSearchCconc.php' },
    'RH': { name: 'rh', unit: '%', file: 'AallAdvanceSearchMet.php' },
    'PM25': { name: 'pm25', unit: 'ug/m3', file: 'AallAdvanceSearchMet.php' }
};

/**
 * Fetches pollution and meteorological data for each station.
 * @param {string} source - The data source to fetch from.
 * @param {function} cb - Callback function to execute with the fetched and formatted data.
 */
export async function fetchData(source, cb) {
    const browser = await puppeteer.launch({ headless: 'shell' });
    const stations = await fetchStations(browser);
    // holder for all formated measurements
    const measurements = [];
    log.debug(`Getting data for ${stations.length} stations`);

    await Promise.all(stations.slice(0,2).map(async (station) => {
        try {
            const values = await fetchStationData(browser, station, timeRange);
            // return value will be wide format with parameters as field naems
            values.map(v => {
                try {
                    measurements.push(formatData(v));
                } catch (err) {
                    log.error(`Measurement error: ${err.message}`, v);
                }
            });
        } catch (err) {
            // station url error
            log.error(`Station error: ${err.message}`);
        }
    }));

    log.debug('Delhi data first measurement:', measurements[0]);
    cb(null, { name: 'unused', measurements });
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
 * Fetches data for all specified parameters by initiating multiple fetchParameterData calls in parallel.
 * @param {Object} browser - The Puppeteer browser instance used for fetching data.
 * @param {Object} station - The station object with name
 * @param {Array} parameters - An array of parameters to fetch data for.
 * @param {Object} timeRange - An object containing startTime and endTime for the data fetch.
 * @returns {Object} An aggregated object of all fetched parameters data.
 */
async function fetchStationData(browser, station, timeRange) {
    // first get all the data
    const dataPromises = Object.keys(parameters).map(parameter =>
        fetchStationParameterData(browser, station, parameter, timeRange)
    );
    const data = await Promise.all(dataPromises).then(d => d.flat());
    // then fix the times
    log.debug(`Found ${data.length} results for ${station.stName}`);

    return data;
}


/**
 * Handles navigation and form interaction within a Puppeteer browser context.
 * @param {Object} browser - The Puppeteer browser instance to use for the page creation.
 * @param {string} url - The URL to navigate to for fetching the parameter data.
 * @param {string} parameter - The parameter to fetch data for.
 * @param {Object} timeRange - An object containing startTime and endTime for the data fetch.
 * @returns {Object} An object containing the parameter name and the fetched data.
 */
async function fetchStationParameterData(browser, station, parameter, { startTime, endTime }) {
    log.debug(`Fetching station parameter data: ${station.stName}/${parameter}`);
    const page = await browser.newPage();
    const file = parameters[parameter].file;
    const url = `${baseUrl}/${file}?stName=${station.stName}`;
    const startDateTime = DateTime.fromFormat(startTime, 'yyyy-MM-dd HH:mm',  { zone: 'Asia/Kolkata' });
    const meas = [];

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
            return chart
                ? chart.series.map(series => series.options.data)[0]
                : []; // just return an empty array instead of null
        });

        // at this point we have an array of values that we assume
        // are in order and hourly
        data.map((value,i) => {
            const datetime = startDateTime.plus({ hours: i+1 });
            meas.push({ ...station, datetime, parameter, value });
        });

        return meas;
    } catch (error) {
        log.warn(`Error fetching data for ${parameter}: ${error.message}`);
        return meas;
    } finally {
        await page.close();
    }
}


/**
 * Fetches station information from the Delhi Pollution Control Committee website.
 * @param {Object} browser - The Puppeteer browser instance used for navigating to the station information URL.
 * @returns {Array} An array of objects, each representing a station and its data.
 */
async function fetchStations(browser) {
    log.debug("Fetching stations", stationsUrl);
    const page = await browser.newPage();
    await page.goto(stationsUrl, { waitUntil: 'networkidle0' });

    let stations = await page.evaluate(() => locations.map(location => ({
        name: location[0],
        latitude: location[1],
        longitude: location[2],
        url: location[3],
        stName: location[3].split('=')[1],
        imageUrl: location[4],
        displayName: location[5]
    })));

    await page.close();
    if(typeof(stations) === 'object') {
        stations = Object.values(stations);
    }
    log.debug(`Fetched stations: ${stations.length}`);
    return stations;
}

/**
 * Formats the fetched station and measurement data
 * @param {Array} stations - An array of station objects with fetched data.
 * @param {string} startTime - The start time for the data fetch, in 'yyyy-MM-dd HH:mm' format.
 * @param {string} endTime - The end time for the data fetch, in 'yyyy-MM-dd HH:mm' format.
 * @returns {Array} An array of formatted measurement objects.
 */
function formatData(data) {

    // we should check data and throw errors accordingly
    // these errors would end up in the measurement error block
    const measurementTime = data.datetime;
    const parameter = parameters[data.parameter];

    const measurement = {
        location: data.name,
        city: " ",
        parameter: parameter.name,
        unit: parameter.unit,
        date: {
            utc: measurementTime.toUTC().toISO({ suppressMilliseconds: true }),
            local: measurementTime.toISO({ suppressMilliseconds: true}),
        },
        coordinates: {
            latitude: data.latitude,
            longitude: data.longitude,
        },
        averagingPeriod: { unit: 'hours', value: 1 },
        attribution: [{
            name: 'Delhi Pollution Control Committee',
            url: 'http://www.dpccairdata.com/dpccairdata/display/index.php'
        }],
        value: data.value,
    };

    return measurement;
}
