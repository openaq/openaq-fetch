import knex from 'knex';
import log from './logger';

let _pg = null;
export function getDB () {
  _pg = _pg || (async () => {
    let knexConfig;
    try {
      knexConfig = module.parent.require('./knexfile-local');
    } catch (e) {
      knexConfig = module.parent.require('./knexfile');
    }

    const pg = knex(knexConfig);
    log.info('Connecting to database.');

    return pg.migrate.latest(knexConfig);
  })()
    .then(pg => {
      log.info('Database connected and migrations are handled, ready to roll!');
      return pg;
    })
    .catch((e) => {
      log.error(e);
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

  return stream.map(m => {
    const obj = {
      location: m.location,
      value: m.value,
      unit: m.unit,
      parameter: m.parameter,
      country: m.country,
      city: m.city,
      source_name: m.sourceName,
      date_utc: m.date.utc,
      source_type: m.sourceType,
      mobile: m.mobile
    };

    // Copy object JSON to the cause field
    obj.data = Object.assign({}, m);

    // If we have coordinates, save them with postgis
    if (m.coordinates) {
      obj.coordinates = st.geomFromText(`Point(${m.coordinates.longitude} ${m.coordinates.latitude})`, 4326);
    }

    return obj;
  });
}

export function streamRecordsToPg (stream, pg, log) {
  const table = pg('measurements')
    .returning('location');

  return stream
    .setOptions({maxParallel: +(process.env.PSQL_POOL_MAX || 10)})
    .assign(record => table.insert(record).then(() => ({ status: 'inserted' })))
    .catch(e => {
      if (e.code === '23505') {
        return Promise.resolve({ status: 'duplicate' });
      }
      log.error(e);
      return Promise.reject(e);
    });
}

export function streamDataToDB (stream, log) {
  const pg = getDB();
  let n = 0;

  return stream
    .map(data => ({data, index: n++}))
    .use(convertMeasurementToSQLObject, pg)
    .use(streamRecordsToPg, pg, log)
    .filter(({status}) => status !== 'duplicate')
  ;
}

/**
 * Saves information about fetches to the database
 */
export async function saveFetches (timeStarted, timeEnded, itemsInserted, err, results) {
  const pg = getDB();

  return pg('fetches')
    .insert({time_started: timeStarted, time_ended: timeEnded, count: itemsInserted, results: JSON.stringify(err || results)})
    .then(() => log.info('Fetches table successfully updated'))
    .catch((e) => log.error(e));
}

/**
 * Save sources information, overwritten any previous results
 *
 */
export async function saveSources (sources) {
  const inserts = sources.map(data => ({data}));

  const pg = getDB();
  return pg('sources')
    .del()
    .then(() => log.verbose('Sources table successfully deleted.'))
    .then(() => pg('sources').insert(inserts))
    .then(() => log.info('Sources table successfully updated.'))
    .catch((e) => log.error(e));
}
