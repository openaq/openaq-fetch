import knex from 'knex';
import moment from 'moment';
import S3UploadStream from 's3-upload-stream';
import { DataStream } from 'scramjet';
import { defer } from './utils';
import log from './logger';

let _pg = null;
function getDB () {
  let knexConfig;
  _pg = _pg || (async () => {
    try {
      knexConfig = require('../knexfile-local');
      log.info('Using connection data from knexfile-local');
    } catch (e) {
      knexConfig = require('../knexfile');
      log.info('Using connection data from production knexfile');
    }

    const pg = knex(knexConfig);
    log.info('Connecting to database.');

    return pg;
  })()
    .then(async pg => {
      await pg.migrate.latest(knexConfig);
      log.info('Database connected and migrations are handled, ready to roll!');
      return pg;
    });
  // Run any needed migrations and away we go
  return _pg;
}

/**
 * Build an object that can be inserted into our database.
 * @param {object} m measurement object
 * @return {object} an object capable of being saved into the PostgreSQL database
 */
function convertMeasurementToSQLObject (stream, pg) {
  const st = require('knex-postgis')(pg);

  return stream.map(data => {
    const obj = {
      location: data.location,
      value: data.value,
      unit: data.unit,
      parameter: data.parameter,
      country: data.country,
      city: data.city,
      source_name: data.sourceName,
      date_utc: data.date.utc,
      source_type: data.sourceType,
      mobile: data.mobile
    };

    // Copy object JSON to the cause field
    obj.data = Object.assign({}, data);

    // If we have coordinates, save them with postgis
    if (data.coordinates) {
      obj.coordinates = st.geomFromText(`Point(${data.coordinates.longitude} ${data.coordinates.latitude})`, 4326);
    }

    return obj;
  });
}

function streamRecordsToPg (stream, pg) {
  const table = pg('measurements')
    .returning('location');

  return stream
    .tap()
    .pipe(new DataStream())
    .setOptions({maxParallel: 1})
    .use(convertMeasurementToSQLObject, pg)
    .assign(async record => {
      try {
        await table.insert(record);
      } catch (cause) {
        if (cause.code === '23505') {
          return { status: 'duplicate' };
        }

        throw cause;
      }
      return { status: 'inserted' };
    });
}

async function streamDataToDB (stream, pg, counts) {
  return stream
    .use(streamRecordsToPg, pg)
    .filter(({status}) => {
      if (status === 'duplicate') {
        counts.duplicates++;
        return false;
      }

      counts.inserted++;
      return true;
    })
    .reduce(x => x++, 0)
  ;
}

async function saveResultsToS3 (stream, s3, bucketName, key, s3ChunkSize) {
  return stream
    .use(streamDataToS3, s3, bucketName, key, s3ChunkSize)
  ;
}

async function streamDataToS3 (stream, s3, bucketName, key, s3ChunkSize) {
  await new Promise((resolve, reject) => {
    const upload = S3UploadStream(s3).upload({
      Bucket: bucketName,
      Key: key
    });

    // 1 MB - means there's a limit of 10GB per upload!
    upload.maxPartSize(s3ChunkSize);
    upload.concurrentParts(5);

    log.debug(`Uploading data to s3 as ${bucketName}/${key} in ${s3ChunkSize} fragments.`);

    stream
      .JSONStringify('\n')
      .pipe(upload)
      .on('error', (e) => {
        console.error(e);
        reject(e);
      })
      .on('uploaded', resolve);
  });
}

/**
 * Saves information about fetches to the database
 *
 * @param {FetchResult} sources
 */
export async function saveFetches ({timeStarted, timeEnded, itemsInserted, errors, results}) {
  const pg = await getDB();

  return pg('fetches')
    .insert([{
      time_started: new Date(timeStarted),
      time_ended: new Date(timeEnded),
      count: itemsInserted,
      results: JSON.stringify(errors || results)
    }])
    .then(() => log.info('Fetches table successfully updated'))
    .catch((e) => log.error(e));
}

/**
 * Save sources information, overwritten any previous results
 *
 * @param {Sources} sources
 */
export async function saveSources (sources) {
  const inserts = Object.values(sources)
    .map(data => ({data: JSON.stringify(data)}));

  const pg = await getDB();
  return pg('sources')
    .del()
    .then(() => log.verbose('Sources table successfully deleted.'))
    .then(() => pg('sources').insert(inserts))
    .then(() => log.info('Sources table successfully updated.'))
    .catch((e) => log.error(e));
}

/**
 * Streams measurements to database and cloud storage
 *
 * @param {OpenAQEnv} env
 * @param {String} bucketName
 */
export function streamMeasurementsToDBAndStorage (stream, {doSaveToS3, s3ChunkSize, doSaveToDB, dryrun}, bucketName) {
  return stream.do(async ({ stream, counts }) => {
    stream.tap();

    if (dryrun) {
      return stream
        .do(m => log.verbose(JSON.stringify(m)))
        .run();
    } else {
      const key = `realtime/${moment().format('YYYY-MM-DD/X')}.ndjson`;
      const pg = await getDB();

      await Promise.all([
        defer(),
        doSaveToS3 ? saveResultsToS3(stream, new (require('aws-sdk').S3)(), bucketName, key, s3ChunkSize) : true,
        doSaveToDB ? streamDataToDB(stream, pg, counts) : true
      ]);
    }
  });
}
