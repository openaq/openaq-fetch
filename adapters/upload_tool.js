/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the data uploaded via the OpenAQ Upload Data tool
 *
 */
'use strict';

import { S3 } from 'aws-sdk';
import { StringStream, DataStream } from 'scramjet';

// The S3 bucket containing the data is in a different region
const s3 = new S3({ region: 'us-east-1' });

const UPLOAD_TOOL_BUCKET = 'upload-tool-bucket-production';
exports.name = 'upload_tool';

const generateAttributions = function (a) {
  let attributions = [];
  attributions.push({
    name: a.attribution_name,
    url: a.attribution_url
  });
  // look for additional attributions
  let searchingAttributions = true;
  let attributionIndex = 2;
  while (searchingAttributions) {
    if (`attribution_name_${attributionIndex}` in a) {
      if (`attribution_url_${attributionIndex}` in a) {
        attributions.push({
          name: a[`attribution_name_${attributionIndex}`],
          url: a[`attribution_url_${attributionIndex}`]
        });
        attributionIndex++;
        continue;
      }
    }
    searchingAttributions = false;
  }
  return attributions;
};

// transforms data from the Upload format to the final Upload format
const transformFormat = function (a, source) {
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
  };
  // check for non-required parameters
  if (a.city) {
    b.city = a.city;
  }
  return b;
};

const readFile = function (params, source) {
  const s3stream = s3.getObject(params).createReadStream();
  return StringStream.from(s3stream, "utf-8")
    .CSVParse({header: true})
};

const readS3Files = async function* (params, source) {
  const data = await s3.listObjects(params).promise();

  for (let i = 0; i < data.Contents.length; i++) {
    try {
      const fileParams = {
        Bucket: UPLOAD_TOOL_BUCKET,
        Key: data.Contents[i].Key
      };
      const result = readFile(fileParams, source);
      yield* result;
    } catch (e) {
      reject(new Error(`Error reading ${data.Contents[i].key}: ${e}`));
    }
  }
};

/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */

exports.fetchStream = function (source, cb) {
  const bucketParams = {
    Bucket: UPLOAD_TOOL_BUCKET,
    Delimiter: '/'
  };
  return DataStream.from(readS3Files(bucketParams, source))
    .map(data => transformFormat(data, source))
  ;
};
