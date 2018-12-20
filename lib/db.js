import knex from 'knex';
import moment from 'moment';
import { pick } from 'lodash';
import S3UploadStream from 's3-upload-stream';
import { DataStream } from 'scramjet';
import log from './logger';
import { ignore } from './utils';
import { cleanup } from './errors';

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
function convertMeasurementToSQLObject (measurement, st, pg) {
  const obj = {
    location: measurement.location,
    value: measurement.value,
    unit: measurement.unit,
    parameter: measurement.parameter,
    country: measurement.country,
    city: measurement.city,
    source_name: measurement.sourceName,
    date_utc: measurement.date.utc,
    source_type: measurement.sourceType,
    mobile: measurement.mobile
  };

  // Copy object JSON to the cause field
  obj.data = Object.assign({}, measurement);

  // If we have coordinates, save them with postgis
  if (measurement.coordinates) {
    obj.coordinates = st.geomFromText(`Point(${measurement.coordinates.longitude} ${measurement.coordinates.latitude})`, 4326);
  }

  return obj;
}

function streamRecordsToPg (stream, pg) {
  const st = require('knex-postgis')(pg);

  const table = pg('measurements')
    .returning('location');

  return stream
    .tap()
    .pipe(new DataStream())
    .setOptions({maxParallel: 1})
    .assign(async measurement => {
      const record = convertMeasurementToSQLObject(measurement, st, pg);
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

/**
 * Streams measurements to database and retuns stream of only the inserted items.
 *
 * @param {DataStream} stream
 * @param {Knex} pg
 * @param {Object} counts
 */
function streamDataToDB (stream, pg, counts) {
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
  ;
}

function saveResultsToS3 (output, s3, bucketName, key, s3ChunkSize) {
  const stream = new DataStream();

  const finishing = stream
    .catch(ignore)
    .map(({status, ...measurement}) => measurement)
    .use(streamDataToS3, s3, bucketName, key, s3ChunkSize)
    .run()
    .catch(e => output.raise(e));

  const endStream = () => {
    if (!ended) stream.end();
    ended = true;
  };

  let ended = false;
  output.whenEnd().then(endStream).catch(ignore);

  cleanup.add(async () => {
    endStream();
    await finishing;
  });

  return stream;
}

async function streamDataToS3 (stream, s3, bucketName, key, s3ChunkSize) {
  await new Promise((resolve, reject) => {
    if (!bucketName) throw new Error('Bucket name is required!');

    const upload = S3UploadStream(s3).upload({
      Bucket: bucketName,
      Key: key
    });

    // 1 MB - means there's a limit of 10GB per upload!
    upload.maxPartSize(s3ChunkSize);
    upload.concurrentParts(5);

    log.debug(`Uploading data to s3 "${bucketName}" as "/${key}" in "${s3ChunkSize}" fragments.`);

    stream
      .JSONStringify('\n')
      .pipe(upload)
      .on('error', (e) => {
        console.error(e);
        reject(e);
      })
      .on('uploaded', resolve);
  });

  return [];
}

/**
 * Saves information about fetches to the database
 *
 * @param {FetchResult} sources
 */
export async function saveFetches ({timeStarted, timeEnded, itemsInserted, results}) {
  const pg = await getDB();

  return pg('fetches')
    .insert([{
      time_started: new Date(timeStarted),
      time_ended: new Date(timeEnded),
      count: itemsInserted,
      results: JSON.stringify(results)
    }])
    .then(() => log.info('Fetches table successfully updated'))
    .catch((error) => log.error(error));
}

/**
 * Save sources information, overwritten any previous results
 *
 * @param {Sources} sources
 */
export async function saveSources (sources) {
  const inserts = Object.values(sources)
    .reduce((acc, sources) => acc.concat(sources), [])
    .filter(data => (data.adapter !== 'dummy'))
    .map(data => (pick(data, ['url', 'adapter', 'name', 'city', 'country', 'description', 'sourceURL', 'resolution', 'contacts', 'active'])))
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
export function streamMeasurementsToDBAndStorage (sourcesStream, {doSaveToS3, s3ChunkSize, dryrun, bucketName}) {
  if (dryrun) {
    return sourcesStream.do(async ({ stream: measurementStream }) => {
      return measurementStream
        .do(m => log.verbose(JSON.stringify(m)))
        .run();
    });
  } else {
    const output = new DataStream();

    let s3stream = null;
    if (doSaveToS3) {
      const key = `realtime/${moment().format('YYYY-MM-DD/X')}.ndjson`;
      s3stream = saveResultsToS3(output, new (require('aws-sdk').S3)(), bucketName, key, s3ChunkSize);
    }

    sourcesStream
      .map(async (item) => {
        const pg = await getDB();
        const { stream: measurementStream, counts } = item;

        const stream = measurementStream.use(streamDataToDB, pg, counts);
        await (doSaveToS3 ? s3stream.pull(stream) : stream.run());

        return item;
      })
      .pipe(output);

    return output;
  }
}
