/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Rio de Janeiro data sources.
 */

import fetch from 'node-fetch';
import { DateTime } from 'luxon';
import { acceptableParameters } from '../lib/utils.js'

export const name = 'rio-de-janeiro'

export async function fetchData(source, cb) {
/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
    try {
      const response = await fetch(source.url);
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data = await response.json();
      const formattedData = formatData(data);    
      cb(null, { name: 'unused', measurements: formattedData });

    } catch (error) {
      console.error('Error fetching data:', error);
      cb(error, null);
    }
  }
  

function formatData(data) {
    return data
      .map(item => {
        return item.medicoes
          .filter(medicao => acceptableParameters.includes(correctParam(medicao.sigla)))
          .map(medicao => {
            const lastData = getLatestData(medicao.dados);
            if (!lastData) {
              return null;
            }
            const date = DateTime.fromFormat(lastData.data, 'yyyy-MM-dd HH:mm:ss', {
              zone: 'America/Sao_Paulo',
            });
            const parameter = correctParam(medicao.sigla);
            return {
              location: item['noEstacao'],
              city: 'Rio de Janeiro',
              parameter: parameter,
              value: parseFloat(lastData.valor),
              unit: parameter === 'co' ? 'ppm' : 'µg/m³',
              date: {
                utc: date.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
                local: date.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
              },
              coordinates: {
                latitude: parseFloat(item['nuLatitude']),
                longitude: parseFloat(item['nuLongitude']),
              },
              attribution: [
                {
                  name: item['fonteDados'],
                  url: "https://jeap.rio.rj.gov.br/je-metinfosmac/portalV2/estacao",
                },
              ],
              averagingPeriod: {
                unit: 'hours',
                value: 1,
              },
            };
          });
      })
      .flat()
      .filter(item => item !== null);
  }
  
function getLatestData(dados) {
    if (!dados || dados.length === 0) {
      return null;
    }
    return dados.reduce((latest, current) => {
      const latestDate = DateTime.fromFormat(latest.data, 'yyyy-MM-dd HH:mm:ss', {
        zone: 'America/Sao_Paulo',
      });
      const currentDate = DateTime.fromFormat(current.data, 'yyyy-MM-dd HH:mm:ss', {
        zone: 'America/Sao_Paulo',
      });
      return currentDate > latestDate ? current : latest;
    });
  }
  

function correctParam(name) {
  switch (name) {
    case 'MP2,5':
      return 'pm25';
    case 'MP10':
      return 'pm10';
    case 'CO':
      return 'co';
    case 'SO2':
      return 'so2';
    case 'NO2':
      return 'no2';
    case 'O3':
      return 'o3';
    case 'NO':
      return 'no';
    case 'NOX':
      return 'nox';
    default:
      return name;
  }
}