import knex from 'knex';
import log from './logger';
import { DataStream } from 'scramjet';
import { promisify } from 'util';
import moment from 'moment';

let _pg = null;
export function getDB () {
  let knexConfig;
  _pg = _pg || (async () => {
    try {
      knexConfig = module.parent.require('../knexfile-local');
      log.info('Using connection data from knexfile-local');
    } catch (e) {
      knexConfig = module.parent.require('../knexfile');
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
export function convertMeasurementToSQLObject (stream, pg) {
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

export function streamRecordsToPg (stream, pg) {
  const table = pg('measurements')
    .returning('location');

  return stream
    .tap()
    .pipe(new DataStream())
    .setOptions({maxParallel: 1})
    .assign(async record => {
      await table.insert(record);
      return { status: 'inserted' };
    })
    .catch(({cause}) => {
      if (cause.code === '23505') {
        return Promise.resolve({ status: 'duplicate' });
      }
      log.error(cause);
      return Promise.reject(cause);
    });
}

export async function streamDataToDB (stream) {
  const pg = await getDB();

  return stream
    .use(convertMeasurementToSQLObject, pg)
    .use(streamRecordsToPg, pg)
    .filter(({status}) => status !== 'duplicate')
    .reduce(x => x++, 0)
  ;
}

/**
 * Saves information about fetches to the database
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

export async function saveResultsToS3 (stream, s3, bucketName, key) {
  return stream
    .flatMap(({results}) => results)
    .map(result => result.data)
    .use(streamDataToS3, s3, bucketName, key)
  ;
}

export async function streamDataToS3 (stream, s3, bucketName, key) {
  return promisify(s3.upload, {
    Body: stream.JSONStringify('\n'),
    Bucket: bucketName,
    Key: key
  });
}

export function streamMeasurementsToDBAndStorage (doSaveToS3, {dryrun}, bucketName) {
  return async ({ stream }) => {
    if (dryrun) {
      return stream
        .do(m => log.verbose(JSON.stringify(m)))
        .run();
    } else {
      const key = `realtime/${moment().format('YYYY-MM-DD/X')}.ndjson`;
      const pg = getDB();
      await Promise.all([
        doSaveToS3 ? saveResultsToS3(stream, new (require('aws-sdk').S3)(), bucketName, key) : true,
        streamDataToDB(stream, pg)
      ]);
    }
  };
}
