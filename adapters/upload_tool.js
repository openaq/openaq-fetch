/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the data uploaded via the OpenAQ Upload Data tool
 *
 */
'use strict';

import { S3 } from 'aws-sdk';
import csv from 'csv-parser'
import log from '../lib/logger';

// The S3 bucket containing the data is in a different region
const s3 = new S3({region: 'us-west-2'});

exports.name = 'upload_tool';

const generateAttributions = function(a) {
  let attributions = []
  attributions.push({
    name: a.attribution_name,
    url: a.attribution_url
  })
  // look for additional attributions 
  let searchingAttributions = true;
  let attributionIndex = 2;
  while(searchingAttributions) {
      if (`attribution_name_${attributionIndex}` in a) {
          if (`attribution_url_${attributionIndex}` in a) {
              attributions.push({
                name: a[`attribution_name_${attributionIndex}`],
                url: a[`attribution_url_${attributionIndex}`]
              })
              attributionIndex++;
              continue
          }
      } 
      searchingAttributions = false
  }
  return attributions;
}

// transforms data from the Upload format to the final Upload format
const transformFormat = function(a, source) {
  let b = {
    parameter: a.parameter,
    location: a.location,
    country: a.country,
    value: parseFloat(a.value),
    unit: a.unit,
    date: {
      utc: a.date_utc,
      local: a.date_local
    },  
    sourceName: source.name, // This will always be `Upload Tool`
    sourceType: a.sourceType,
    mobile: a.mobile === true || a.mobile === 'true',
    coordinates: {
      longitude: parseFloat(a.coordinates_longitude),
      latitude: parseFloat(a.coordinates_latitude)
    },
    attribution: generateAttributions(a),
    averagingPeriod: {
      value: parseFloat(a.averagingPeriod_value),
      unit: a.averagingPeriod_unit
    }
  }
  // check for non-required parameters
  if (a.city) {
    b.city = a.city
  }
  console.log('storing', b)
  return b
}

const readFile = function(params, source) {
  return new Promise((resolve, reject) => {
    const s3stream = s3.getObject(params).createReadStream();
    const result = []
    s3stream.pipe(csv())
    .on('error', (err) => {
      reject(err)
    })
    .on('data', (data) => {
      result.push(transformFormat(data, source))
    })
    .on('end', () => {
      resolve(result)
    })
  })
}

const readS3Files = function(params, source) {
  return new Promise((resolve, reject) => {
    let results = []
    s3.listObjects((params), async function (e, data) {
        if(e) {
          reject(e)
        }
        for (let i = 0; i < data.Contents.length; i++) {
          try {
            const fileParams = {
              Bucket: 'upload-tool-bucket-dev',
              Key: data.Contents[i].Key
            }
            const result = await readFile(fileParams, source);
            results.push(result)
            if (i === data.Contents.length - 1) {
              resolve(results)
            }
          } catch (e) {
            reject(`Error reading ${data.Contents[i].key}: ${e}`)
          }
        }
      });
  })
}

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

exports.fetchData = function (source, cb) {
  const bucketParams = {
    Bucket: 'upload-tool-bucket-dev',
    Delimiter: '/'
  };
    readS3Files(bucketParams, source).then(measurements => {
      cb(null, {
        name: 'upload-tool',
        measurements: measurements[0]
      })
    }).catch(e => {
      cb(e)
    })
}
