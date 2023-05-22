import puppeteer from 'puppeteer';
import { DateTime } from 'luxon';
import fetch from 'node-fetch';
import got from 'got';

const bearerAuth = await getBearerAuth().then((bearerAuth) => bearerAuth);

const STATIONS_URL =
  'https://arpabaegis.arpab.it/Datascape/v3/locations?category=All&basin_org_id&basin_id&region_id&province_id&station_id&filter_central_id&filter_id&_=1677195752467';
const MEASUREMENTS_URL =
  'https://arpabaegis.arpab.it/Datascape/v3/elements?station_id=951100&longitude&latitude&category=1&ui_culture=en&field=ElementName&field=Time&field=Value&field=Decimals&field=MeasUnit&field=Trend&field=StateId&field=IsQueryable&filter_central_id&filter_id&_=1677195752563';

const HEADERS = {
  authorization: bearerAuth,
  'accept-language': 'en-US,en;q=0.9',
  accept: '*/*',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'sec-ch-ua':
    '"Not_A Brand";v="99", "Google Chrome";v="109", "Chromium";v="109"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-requested-with': 'XMLHttpRequest',
  Referer: 'https://arpabaegis.arpab.it/aegis/map/map2d',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

async function fetchData() {
  let stations = await fetchStations();

  // Map through each station object and fetch data for each station
  let requests = stations.map((station) => {
    if (station.hasOwnProperty('i')) {
      const stationId = station.i;
      const url = `https://arpabaegis.arpab.it/Datascape/v3/elements?station_id=${stationId}&longitude&latitude&category=1&ui_culture=en&field=ElementName&field=Time&field=Value&field=Decimals&field=MeasUnit&field=Trend&field=StateId&field=IsQueryable&filter_central_id&filter_id&_=1677195752563`;
      const options = {
        method: 'GET',
        headers: HEADERS,
        body: null,
      };
      return fetch(url, options)
        .then((response) => response.json())
        .then((data) => {
          // Add fetched data to station object
          station.data = data;
          return station;
        })
        .catch((error) => {
          throw error;
        });
    }
  });

  // Wait for all fetch requests to complete and return array of station objects
  let stationData = await Promise.all(requests);
  let out = formatData(stationData);
  // out = translate(out);
  // await translateValues(out)
  console.log(out.length);
  return out;
}

async function fetchStations() {
  try {
    let bearer;
    const response = await fetch(STATIONS_URL, {
      headers: HEADERS,
      method: 'GET',
      body: null,
    });
    const data = await response.json();
    // console.log(data);
    return data;
  } catch (error) {
    console.error(error);
  }
}

function formatData(stationData) {
  const formattedData = [];

  stationData.forEach((station) => {
    const {
      n: location,
      o: agency,
      x: longitude,
      y: latitude,
    } = station;

    station.data.forEach((data) => {
      if (data.time && data.value) {
        const formattedMeasurement = {
          location,
          agency,
          longitude,
          latitude,
          elementName: data.elementName,
          stationName: data.stationName,
          time: data.time,
          measUnit: data.measUnit,
          value: data.value,
        };
        formattedData.push(formattedMeasurement);
      }
    });
  });

  return formattedData;
}

async function getBearerAuth() {
  let auth;
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://arpabaegis.arpab.it');

  page.on('request', (request) => {
    const headers = request.headers();
    if ('authorization' in headers) {
      auth = headers['authorization'];
    }
  });

  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  await browser.close();

  return auth;
}

////// Print it
fetchData()
  .then((measurements) => {
    console.dir(measurements, { depth: null });
  })
  .catch((error) => {
    console.error(error);
  });
///////

let translations = {
  'Dissolved Oxygen': 'Dissolved Oxygen',
  'Water pH': 'Water pH',
  'Water Level': 'Water Level',
  'Vector Wind Speed': 'Vector Wind Speed',
  'Relative Humidity': 'Relative Humidity',
  'idrocarburi totali non metanic': 'total non-methanic hydrocarbons',
  'POLV.': 'DUST',
  'Idrogeno solforato': 'Hydrogen sulphide',
  'Temperatura H2O Retry - AT500': 'Temperatura H2O Retry - AT500',
  'Temperatura acqua BEC': 'BEC water temperature',
  "Velocita' del vento_val": 'Wind speed_val',
  DMS_val: 'DMS_val',
  'o-Xilene_val': 'o-Xylene_val',
  'Water Temperature': 'Water Temperature',
  'Ossigeno Disciolto': 'Dissolved Oxygen',
  Redox: 'Redox',
  'Clorofilla - AT500': 'Chlorophyll - AT500',
  'Temperatura aria_val': 'Air temperature_val',
  Toluene_val: 'Toluene_val',
  'PM10, particolato_val': 'PM10, particulate_val',
  'm,p-Xileni': 'm,p-Xileni',
  'Monossido di carbonio': 'Carbon monoxide',
  'Velocità del vento': 'Wind speed',
  'Atmospheric Pressure': 'Atmospheric Pressure',
  mpxilen_val: 'mpxilen_val',
  'Profondità sonda': 'Probe depth',
  'Scalar Wind Speed': 'Scalar Wind Speed',
  mxilene: 'mxilene',
  'PM2.5, materiale particolato f': 'PM2.5, particulate matter f',
  'Sound Speed in Air': 'Sound Speed in Air',
  'Radiazione netta_val': 'Net radiation_val',
  'PM2.5, particolato_val': 'PM2.5, particulate_val',
  'Temperatura aria': 'Air temperature',
  'Air Temperature': 'Air Temperature',
  'Pressione atmosferica_val': 'Atmospheric pressure_val',
  'ISE Ammonio': 'ISE Ammonium',
  'Profondità Sonda': 'Probe depth',
  "Umidita' relativa": 'Relative humidity',
  Toluene: 'Toluene',
  'Elevazione del vento': 'Wind elevation',
  'Americio 241': 'Americium 241',
  'O3, ozono': 'O3, ozono',
  'NO, monossido di azoto': 'NO, nitric oxide',
  Turbidity: 'Turbidity',
  'Scalar Wind Direction': 'Scalar Wind Direction',
  Etilbenzene_val: 'With ethylbenzene_',
  'Direzione del vento_val': 'Wind direction_val',
  'Vector Wind Direction': 'Vector Wind Direction',
  'PM10, materiale particolato fr': 'PM10, particulate material fr',
  Benzene_val: 'Benzene_val',
  'Monossido di carbonio_val': 'Carbon monoxide_val',
  pH: 'pH',
  'NOx, ossidi di azoto_val': 'NOx, nitrogen oxides_val',
  'NO2, biossido di azoto': 'NO2, nitrogen dioxide',
  'Direzione del vento': 'Wind direction',
  'Pressione atmosferica': 'Atmospheric pressure',
  Benzene: 'Benzene',
  "Umidita' relativa_val": 'Relative humidity_val',
  'Idrogeno solforato_val': 'Hydrogen sulphide_val',
  'Gamma Radiation': 'Gamma Radiation',
  'm,p-Xileni_val': 'with m,p-Xileni_',
  'Cesio 134': 'Cesium 134',
  Metano: 'Methane',
  'SO2, biossido di zolfo_val': 'SO2, sulfur dioxide_val',
  'Elevazione del vento_val': 'Wind elevation_val',
  Conducibilità: 'conductivity',
  BenzGC: 'BenzGC',
  Etilbenzene: 'Etilbenzene',
  'Temperatura sonica_val': 'Sonic temperature_val',
  'NO2, biossido di azoto_val': 'NO2, nitrogen dioxide_val',
  'O3, ozono_val': 'O3, ozono_val',
  pxilene_val: 'pxilene_val',
  MET: 'MET',
  'Water Redox': 'Water Redox',
  "Conducibilita' BEC": "Conducibilita' BEC",
  'Direct Solar Radiation': 'Direct Solar Radiation',
  'Idrocarburi non metanici_val': 'Non-methane hydrocarbons_val',
  'NO, monossido di azoto_val': 'NO, nitric oxide_val',
  'Cobalto 60': 'Cobalt 60',
  'SO2, biossido di zolfo': 'SO2, sulfur dioxide',
  'Gust Wind Speed': 'Gust Wind Speed',
  Conductivity: 'Conductivity',
  'NOx, ossidi di azoto': 'NOx, nitrogen oxides',
  EtSH: 'EtSH',
  'Berillio 7': 'Beryllium 7',
  'Radiazione globale_val': 'Global radiation_val',
  'Snow Level': 'Snow Level',
  'Radiazione netta': 'net radiation',
  'THC, idrocarburi totali': 'THC, total hydrocarbons',
  'Gust Wind Direction': 'Gust Wind Direction',
  'Livello Idrometrico VEGA': 'VEGA hydrometric level',
  RAD_SOL: 'ROW_SOL',
  'Umidità relativa': 'Relative humidity',
  pxilene: 'pxilene',
  mxilene_val: 'mxilene_val',
  MeSH: 'MeSH',
  'Temperatura acqua ISE': 'ISE water temperature',
  "Velocita' del vento": 'Wind speed',
  'Iodio 131': 'Iodine 131',
  DMS: 'DMS',
  Radon: 'Radon',
  "Velocita' suono aria_val": 'Sound velocity air_val',
  'Kripton 85': 'Krypton 85',
  'o-Xilene': 'o-Xylene',
  MeSH_val: 'MeSH_val',
  'ISE Cloruri': 'ISE Chlorides',
  mpxilen: 'mpxilen',
  'Profondità Sonda BEC': 'BEC probe depth',
  RAD_SOL_val: 'ROW_SOL_val',
  'Cesio 137': 'Cesium 137',
  'Temperatura sonica': 'Sonic temperature',
  EtSH_val: 'EtSH_val',
  'Potassio 40': 'Potassium 40',
  'Temperatura H2O - AT500': 'Temperatura H2O - AT500',
  'ISE Nitrati': 'ISE Nitrates',
  'Radiazione globale': 'global radiation',
  Metano_val: 'Methane_val',
  MET_val: 'MET_val',
  'pH BEC': 'pH BEC',
  'Redox BEC': 'Redox BEC',
  CS: 'CS',
  'Torbidimetro BEC': 'BEC turbidimeter',
  'Ossigeno disciolto BEC': 'Dissolved oxygen BEC',
};
