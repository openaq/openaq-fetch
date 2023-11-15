//

// import got from 'got';

// async function postData() {
//   const url =
//     'https://desarrollo.oefa.gob.pe/openaq/backend/consulta/inf';
//   const body = {
//     usuario: 'OPENAQ',
//     clave: 'OPENAQ',
//     fechaInicio: '',
//     fechaFinal: '',
//     idStation: '',
//   };

//   try {
//     const response = await got.post(url, {
//       json: body,
//       responseType: 'json',
//     });

//     console.log('Response:', response.body);
//   } catch (error) {
//     console.error('Error:', error.response.body);
//   }
// }

// postData();
//////
// import got from 'got';

// async function checkDataForStation (idStation) {
//   const url =
//     'https://desarrollo.oefa.gob.pe/openaq/backend/consulta/inf';
//   const body = {
//     usuario: 'OPENAQ',
//     clave: 'OPENAQ',
//     fechaInicio: '',
//     fechaFinal: '',
//     idStation: idStation.toString(),
//   };

//   try {
//     const response = await got.post(url, {
//       json: body,
//       responseType: 'json',
//     });

//     if (response.body.data && response.body.data.length > 0) {
//       return idStation;
//     }
//     return null;
//   } catch (error) {
//     console.error(
//       `Error for idStation ${idStation}:`,
//       error.response.body
//     );
//     return null;
//   }
// }

// async function findStationsWithData() {
//   const stationIds = Array.from({ length: 100 }, (_, i) => i + 1);
//   const stationChecks = stationIds.map(checkDataForStation);
//   const results = await Promise.all(stationChecks);

//   const stationsWithData = results.filter((id) => id !== null);
//   console.log(`Stations with data: ${stationsWithData}`);
// }

// findStationsWithData();
// //
// import got from 'got';

// async function checkDataForStation(idStation) {
//   const url =
//     'https://desarrollo.oefa.gob.pe/openaq/backend/consulta/inf';
//   const body = {
//     usuario: 'OPENAQ',
//     clave: 'OPENAQ',
//     fechaInicio: '',
//     fechaFinal: '',
//     idStation: idStation.toString(),
//   };

//   try {
//     const response = await got.post(url, {
//       json: body,
//       responseType: 'json',
//     });

//     const data = response.body.data;
//     if (data && data.length > 0) {
//       // Return the last object in the 'data' array
//       return { idStation, lastDataObject: data[data.length - 1] };
//     }
//     return null;
//   } catch (error) {
//     console.error(
//       `Error for idStation ${idStation}:`,
//       error.response.body
//     );
//     return null;
//   }
// }

// async function findStationsWithData() {
//   const stationIds = Array.from({ length: 30 }, (_, i) => i + 1);
//   const stationChecks = stationIds.map(checkDataForStation);
//   const results = await Promise.all(stationChecks);

//   // Filter out null values and print the last data object for each station
//   results
//     .filter((result) => result !== null)
//     .forEach((result) =>
//       console.log(
//         `Last data object for idStation ${result.idStation}:`,
//         result.lastDataObject
//       )
//     );
// }

// findStationsWithData();

import got from 'got';

function createMeasurements(data) {
    const pollutants = ['pm10', 'pm25', 'so2', 'h2s', 'co', 'no2', 'pbar', 'pp', 'temp', 'hr', 'ws', 'wd', 'rs'];
    const measurements = [];

    for (const pollutant of pollutants) {
        if (data.hasOwnProperty(pollutant)) {
            const measurement = {
                time: data.date,
                stationName: data.station,
                location: data.attribution.location,
                coordinates: data.coordinates,
                pollutant: pollutant,
                value: data[pollutant]
            };
            measurements.push(measurement);
        }
    }

    return measurements;
}

async function checkDataForStation(idStation) {
    const url = 'https://desarrollo.oefa.gob.pe/openaq/backend/consulta/inf';
    const body = {
        usuario: "OPENAQ",
        clave: "OPENAQ",
        fechaInicio: "",
        fechaFinal: "",
        idStation: idStation.toString()
    };

    try {
        const response = await got.post(url, {
            json: body,
            responseType: 'json'
        });

        const data = response.body.data;
        if (data && data.length > 0) {
            // Return the last object in the 'data' array
            return { idStation, lastDataObject: data[data.length - 1] };
        }
        return null;
    } catch (error) {
        console.error(`Error for idStation ${idStation}:`, error.response.body);
        return null;
    }
}

async function findStationsWithData() {
    const stationIds = Array.from({ length: 30 }, (_, i) => i + 1);
    const stationChecks = stationIds.map(checkDataForStation);
    const results = await Promise.all(stationChecks);

    let allMeasurements = [];

    results.filter(result => result !== null)
           .forEach(result => {
               const measurements = createMeasurements(result.lastDataObject);
               allMeasurements = allMeasurements.concat(measurements);
           });

    console.log('All Measurements:', allMeasurements);
}

findStationsWithData();
