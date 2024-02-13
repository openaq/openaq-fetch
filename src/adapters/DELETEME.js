import got from 'got';
// Configure the logger for console output
const log = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

// API credentials and parameters
const apiConfig = {
  url: 'https://sistemas.oefa.gob.pe/openaq/backend/consulta/inf',
  user: 'OPENAQ',
  password: '@mb13nt@l@1R3',
  startDate: '2023-01-01',
  endDate: '2023-10-12',
  idStation: '2'
};

async function fetchStationData() {
  try {
    log.info('Starting request for station data...');

    const body = {
      user: apiConfig.user,
      password: apiConfig.password,
      startDate: apiConfig.startDate,
      endDate: apiConfig.endDate,
      idStation: apiConfig.idStation
    };

    log.debug('Request body:', body);

    const response = await got.post(apiConfig.url, {
      json: body,
      responseType: 'json',
      timeout: { response: 100000 } // Increased timeout for the response
    });
console.dir(response, { depth: null })
    log.info('Data successfully retrieved for the station:', apiConfig.idStation);
    log.debug('Response:', response.body);
  } catch (error) {
    log.error('An error occurred during the API request:', error.message);
    log.debug('Error details:', error.response?.body || error);
  }
}

fetchStationData();
