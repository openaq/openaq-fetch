import { promisify } from 'util';
import { DataStream } from 'scramjet';
import { validate } from 'jsonschema';
import log from './logger';
import { ADAPTER_ERROR, MeasurementValidationError, handleMeasurementErrors, AdapterError, forwardErrors } from './errors';
import { getAdapterForSource } from './adapters';
import { ignore, unifyMeasurementUnits, removeUnwantedParameters, unifyParameters } from './utils';
import moment from 'moment';

/**
 * @typedef MeasurementObject
 * @extends Object
 * @prop {number} fetchStarted timestamp (in millis) when the execution has started
 * @prop {number} [fetchEnded=NaN] timestamp (in millis) when the execution has ended or `NaN` until the fetch is running
 * @prop {number} duration number of seconds between when execution was started and when it was ended or until current timestamp if execution is still running
 * @prop {Object.<string,number>} [failures={}] a breakdown of number of errors in an object which keys reflect the cause message and values the number of occurrences.
 * @prop {number} [count=NaN] the number of measurements in the stream (available after the stream is ended)
 * @prop {Promise} whenDone promise resolved on measurements fetch completion
 */

const measurementSchema = require('./measurement-schema');

async function getStreamFromAdapter (adapter, source) {
  log.info(`Getting stream for "${source.name}" from "${adapter.name}"`);

  if (!adapter.fetchStream) {
    log.debug(`Getting data for "${source && source.name}" from adapter "${adapter.name}"`);
    const data = await (promisify(adapter.fetchData)(source));
    const out = DataStream.from(data.measurements);
    out.name = data.name;
    return out;
  }

  log.debug(`Fetching stream for "${source && source.name}" from adapter "${adapter.name}"`);
  const out = DataStream.from(adapter.fetchStream, source);
  out.name = out.name || source.adapter;
  return out;
}

/**
 * Generates a transport object based on source and output stream
 *
 * @returns {MeasurementObject}
 */
function createFetchObject (input, source, failures, dryRun) {
  let fetchEnded = NaN;
  const counts = {
    total: 0,
    duplicates: 0,
    inserted: 0
  };

  const stream = input
    .do(() => counts.total++)
  ;

  const whenDone = stream
    .whenEnd()
    .then(() => { fetchEnded = Date.now(); })
    .catch(ignore);

  return {
    fetchStarted: Date.now(),
    get fetchEnded () {
      return fetchEnded;
    },
    get duration () {
      return ((fetchEnded || Date.now()) - this.fetchStarted) / 1000;
    },
    get failures () {
      return fetchEnded ? failures : null;
    },
    get count () {
      return fetchEnded && (!dryRun ? counts.inserted : counts.total);
    },
    get message () {
      return `${dryRun ? '[Dry Run] ' : ''}New measurements found for ${source.name}: ${this.count}`;
    },
    dryRun,
    stream,
    source,
    counts,
    whenDone,
    get resultsMessage () {
      return fetchEnded
        ? {
          message: this.message,
          failures: this.failures,
          count: this.count,
          duration: this.duration,
          sourceName: this.source.name
        }
        : null;
    }
  };
}

function normalizeDate (measurement) {
  if (measurement.date) {
    if (measurement.date instanceof Date) {
      measurement.date = {
        local: moment(measurement.date).format()
      };
    }

    if (!measurement.date.utc && measurement.date.local) {
      measurement.date.utc = +new Date(measurement.date.local);
    }

    if (measurement.date.utc) {
      measurement.date.utc = new Date(measurement.date.utc).toISOString();
    }
  }

  return measurement;
}

function fixMeasurements (stream, source) {
  return stream
    .do(normalizeDate)
    .do(unifyMeasurementUnits)
    .do(unifyParameters)
    .map(({
      date, parameter, value, unit, averagingPeriod,
      location, city, country, coordinates,
      attribution, sourceType, sourceName, mobile
    }) => ({
      date,
      parameter,
      value,
      unit,
      averagingPeriod,

      location: location || source.location || source.name,
      city: city || source.city,
      country: country || source.country,
      coordinates,

      attribution,
      sourceName: sourceName || source.name,
      sourceType: sourceType || source.type || 'government',
      mobile: typeof mobile === 'undefined' ? !!source.mobile : mobile
    }))
  ;
}

/**
 * Filter measurements from a measurement stream
 *
 * @param {DataStream<Measurement>} stream The measurements stream to prune measurements from
 * @return {DataStream<Measurement>} A stream pruned of invalid measurement objects, may be empty
 *                                   and a failures object of aggregated reasons for cause failures
 */
function validateMeasurements (stream, source) {
  const out = stream.map(
    async measurement => {
      let v = validate(measurement, measurementSchema);

      if (v.errors.length === 0) {
        return measurement;
      } else {
        throw new MeasurementValidationError(source, {measurement, errors: v.errors});
      }
    }
  );

  return out;
}

export async function getCorrectedMeasurementsFromSource (source, env) {
  if (source instanceof Error) throw source;

  const [ret] = await (
    DataStream.from([source])
      .use(fetchCorrectedMeasurementsFromSourceStream, {strict: true})
      .toArray()
  );

  return ret;
}

/**
 * Create a function to ask the adapter for cause, verify the cause and output the ready stream.
 *
 * @param {DataStream} stream stream of sources
 * @param {OpenAQEnv} env
 *
 */
export function fetchCorrectedMeasurementsFromSourceStream (stream, env) {
  log.debug(`Fetching corrected measurements from a stream of sources`);
  return stream.into(
    async (out, source) => {
      const failures = {};
      const input = new DataStream();
      let error = null;

      const output = input
        .use(fixMeasurements, source)
        .use(validateMeasurements, source)
        .use(removeUnwantedParameters)
        .use(handleMeasurementErrors, failures, source)
        .use(forwardErrors, stream, source, failures, env)
      ;

      try {
        log.debug(`Looking up adapter for source "${source && source.name}"`);
        const adapter = await getAdapterForSource(source);

        (await getStreamFromAdapter(adapter, source)).pipe(input);

        if (error) throw error;
        else error = true;
      } catch (cause) {
        await (
          input.raise(
            cause instanceof AdapterError ? cause : new AdapterError(ADAPTER_ERROR, source, cause)
          )
        );
        input.end();
      }

      await out.whenWrote(createFetchObject(output, source, failures, env.dryrun));
    },
    new DataStream()
  );
}
