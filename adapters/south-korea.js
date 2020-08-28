'use strict';

import { default as moment } from 'moment-timezone';
import { acceptableParameters, promiseRequest } from '../lib/utils';

export const name = 'south-korea';



export async function fetchData (source, cb) {
  try {
     const api_key = "7%2Fmy1cg3EAkMjrdaUI0fmq5SOnVRM1CQCMSVCr3X1zJ5R2ct4%2Bu0HHOCaxfJCCT%2BL3bjyTSpOVHnz%2Bx%2BiwHDPQ%3D%3D"

     var stationUrl = 'http://openapi.airkorea.or.kr/openapi/services/rest/MsrstnInfoInqireSvc/';
     var numOfRows = 550;
     stationUrl += 'getMsrstnList';
     stationUrl += '?' + 'ServiceKey' + '=' + api_key;

    // not sure this works
     var $ = cheerio.load(await promiseRequest(stationUrl), {xmlMode: true});

     // loop through list of items
     var stationItems = []
    $('items').each(function (i, elem) {
        var item = $(elem)
        stationItems.push(item)
    };

     var numOfRows = 10;
     var pageNo = 1;
     var dataTerm = 'DAILY';
     var url = source.url;
     var queryParams ='?' + encodeURIComponent('ServiceKey') +'='+ api_key;
     queryParams +='&' + encodeURIComponent('dataTerm') +'=' + encodeURIComponent(dataTerm);
     queryParams +='&';

    // loop through list of station objects
    // make the 2nd API call
    // when 10 measurements are returned
    // append that object to the base
    const measurements = stationItems.reduce((acc, item) => {
       var stationName = item('stationName').text();
       var latitude = item('dmX').text();
       var longitude = item('dmY').text();

      const baseMeta = {
        location: stationName,
        city: stationName,
        coordinates: {
          latitude: Number(latitude),
          longitude: Number(longitude),
        },
        attribution: [{
          name: source.name,
          url: source.sourceURL
        }]
      };

      const dataUrl = url + queryParams + encodeURIComponent('stationName') +'=' + encodeURIComponent(stationName);
      var stationData = cheerio.load(await promiseRequest(dataUrl), {xmlMode: true});

      const latestMeasurements = parseParams(stationData.parameters); // Q: not sure what .parameters does -- list?

      return acc.concat(latestMeasurements.map(m => ({ ...baseMeta, ...m })));
    }, []);

    cb(null, {name: 'unused', measurements});
  } catch (e) {
    cb(e);
  }
}

 /*
 parseParams( {
    dataTime : 2020-08-06 12:00,
    mangName : 도시대기,
    so2Value : 0.002,
    coValue : 0.2,
    o3Value : 0.018,
    no2Value : 0.015,
    pm10Value :11,
    pm10Value :24,
    pm25Value : 6, 
    pm25Value : 6,
    <khaiValue>30</khaiValue>
    <khaiGrade>1</khaiGrade>
    <so2Grade>1</so2Grade>
    <coGrade>1</coGrade>
    <o3Grade>1</o3Grade>
    <no2Grade>1</no2Grade>
    <pm10Grade>1</pm10Grade>
    <pm25Grade>1</pm25Grade>
    <pm10Grade1h>1</pm10Grade1h>
    <pm25Grade1h>1</pm25Grade1h>
 })

 [ {dictionary for so2} , {dictionary for c0}, {"03"} ]
 */

const measurementKeys = ["So2", "Co", "O3", "No2", "Pm10value", "p25"];

//makes second API call to get the API measurement info
function parseParams (params) {
  const date = params["dataTime"] // do we only need 1 data point per station?
  const country_tz = moment.tz.zonesForCountry('South Korea');
  const date = moment.tz(latestM.dataTime, country_tz);

  var measurementList = []

  measurementKeys.each(function, (i, elem)) {
    var measurement = params(elem);

    measurementList.push({
      date: {
        utc: date.toDate(), // 2020-01-03T04:00:00.000Z
        local: date.format('YYYY-MM-DD HH:mm') // '2020-07-27 05:00' // java simpledateformat
      },
      parameter: elem.toLowerCase().replace('.', ''),
      value: Number(measurement.value), //Q: do we need to call .value?
      unit: "ppm", // Q: or ug/m3? not sure
      averagingPeriod: "1h" //Q:  no clue what this should be
    }
    )
  }
  return measurementList
}
