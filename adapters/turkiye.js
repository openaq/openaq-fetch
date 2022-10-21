/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Turkiye data sources.
 */

 'use strict';

 import * as fs from 'fs';
 import { REQUEST_TIMEOUT } from '../lib/constants';
 import { default as baseRequest } from 'request';
 import { DateTime } from 'luxon';
 import { parallel } from 'async';
 import { convertUnits } from '../lib/utils';
 import {parse} from 'wellknown';
 const request = baseRequest.defaults({ timeout: REQUEST_TIMEOUT });
 
 exports.name = 'turkiye';
 
 /**
  * Fetches the data for a given source and returns an appropriate object
  * @param {object} source A valid source object
  * @param {function} cb A callback of the form cb(err, data)
  */
  
 exports.fetchData = function (source, cb) {
 
     request(source.url, (err, res, body) => {
         if (err || res.statusCode !== 200) {
         return cb({ message: 'Failure to load data url' });
         }
         try {
         
         const res = JSON.parse(body);
         const data = formatData(res.objects);
         
             if (data === undefined) {
                 return cb({ message: 'Failure to parse data.' });
             }
             return cb(null, data);
         } catch (e) {
         return cb(e);
             }
         }
         );
     }
    
 const validParameters = {
     PM25: {'value': 'pm25', 'unit': 'µg/m³'},
     PM10: { 'value': 'pm10', 'unit' : 'µg/m3' },
     O3: { 'value' : 'o3', 'unit' : 'µg/m3 ' },
     SO2: {'value' : 'so2' , 'unit' : 'µg/m3 '},
     NO2: {'value' : 'no2', 'unit' : 'µg/m3 ' },
     CO: { 'value' : 'co', 'unit' : 'mg/m3'},
 };
 
 /**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} results Fetched source data and other metadata
 * @return {object} Parsed and standarized data our system can use
 */
 
 function formatData(locations) {
     let out = [];
     for (const location of locations) {
     let coords = parse(location['Location']).coordinates;
     const filtered = Object.entries(location["Values"]).filter(([key, _]) => { 
         return key in validParameters;
     }).map(o => {
         return {
         "parameter": validParameters[o[0]].value, 
         "unit": validParameters[o[0]].unit, 
         "value": o[1] 
         }
     });
     const data = filtered.map((tr) => {
     return {
         location: 'TR',
         city: location.City_Title,
         value: tr.value,
         unit: tr.unit,
         parameter: tr.parameter,
         date: {
         // time in Turkey is UTC+3
         local: location.Values.Date,
         utc: DateTime.fromISO(location.Values.Date, { zone: 'Europe/Istanbul' }).toUTC().toISO(), 
         },
         coordinates: {
         latitude: coords[1],
         longitude: coords[0],
         },
         attribution: [
         {
             name: 'T.C. Çevre ve Şehircilik Bakanlığı',
             url: 'https://sim.csb.gov.tr/SERVICES/airquality',
         },
         ],
         averagingPeriod: { unit: 'hours', value: 1 },
     };
     });
     out.push(data);
     }
     return {name: 'unused', measurements:out.flat()};
 };