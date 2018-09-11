import { promisify } from 'util';
import { DataStream } from 'scramjet';
import { validate } from 'jsonschema';
import log from './logger';
import { FetchError, ADAPTER_NOT_FOUND, ADAPTER_ERROR, MeasurementValidationError, handleMeasurementErrors } from './errors';
import { getAdapterForSource } from './adapters';
import { ignore, unifyMeasurementUnits, removeUnwantedParameters } from './utils';

const measurementSchema = require('./measurement-schema');

export async function getStreamFromAdapter (adapter, source) {
  log.info(`Getting stream for "${source.name}" from "${adapter.name}"`);

  if (!adapter.fetchStream) {
    const data = await promisify(adapter.fetchData)(source);
    const out = DataStream.from(data.measurements);
    out.name = data.name;
    return out;
  }

  return adapter.fetchStream(source);
}

/**
 * @typedef MeasurementObject
 * @prop {number} fetchStarted timestamp (in millis) when the execution has started
 * @prop {number} [fetchEnded=NaN] timestamp (in millis) when the execution has ended or `NaN` until the fetch is running
 * @prop {number} duration number of seconds between when execution was started and when it was ended or until current timestamp if execution is still running
 * @prop {Object.<string,number>} [failures={}] a breakdown of number of errors in an object which keys reflect the cause message and values the number of occurrences.
 * @prop {number} [count=NaN] the number of measurements in the stream (available after the stream is ended)
 * @prop {Promise} whenDone promise resolved on measurements fetch completion
 */

/**
 * Generates a transport object based on source and output stream
 */
export function createFetchObject (input, source, failures, dryRun) {
  let fetchEnded = NaN;
  let count = 0;

  const stream = input
    .do(() => count++)
  ;

  const whenDone = stream
    .run()
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
      return fetchEnded && count;
    },
    get message () {
      return `${dryRun ? '[Dry Run] ' : ''}New measurements inserted for ${source.name}: ${this.count}`;
    },
    dryRun,
    stream,
    source,
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

export function normalizeDate ({date}) {
  if (!date.utc && date.local) {
    date.utc = +new Date(date.local);
  }
  // date.utc = new Date(date.utc).toISOString();
}

export function fixMeasurements (stream, source, failures) {
  return stream
    .use(handleMeasurementErrors, failures)
    .use(removeUnwantedParameters)
    .do(normalizeDate)
    .do(unifyMeasurementUnits)
    .map(({
      date, parameter, value, unit, averagingPeriod,
      location, city, country, coordinates,
      attribution, sourceType, mobile
    }) => ({
      date,
      parameter,
      value,
      unit,
      averagingPeriod,

      location: location || source.location || stream.name,
      city: city || source.city,
      country: country || source.country,
      coordinates,

      attribution,
      sourceName: source.name,
      sourceType: sourceType || source.type || 'government',
      mobile: !!(typeof mobile === 'undefined' ? source.mobile : mobile)
    }))
  ;
}

/**
 * Verifies if the measurements stream itself adhere's to requirements.
 *
 * @param {DataStream<Measurement>} stream
 */
export function verifyMeasurementsStreamInstance (stream) {
  if (typeof stream !== 'object' && stream instanceof DataStream) {
    let isValid = false;
    let failures = { 'no data provided': 1 };
    return { isValid, failures };
  }
  let isValid = !!stream.name;
  let failures = [];

  return { isValid, failures };
}

/**
 * Filter measurements from a measurement stream
 *
 * @param {DataStream<Measurement>} stream The measurements stream to prune measurements from
 * @return {DataStream<Measurement>} A stream pruned of invalid measurement objects, may be empty
 *                                   and a failures object of aggregated reasons for cause failures
 */
export function validateMeasurements (stream, source) {
  const out = stream.map(
    async measurement => {
      let v = validate(measurement, measurementSchema);

      if (v.errors.length === 0) {
        return measurement;
      } else {
        return new MeasurementValidationError(source, {measurement, errors: v.errors});
      }
    }
  );

  return out;
}

/**
 * Create a function to ask the adapter for cause, verify the cause and output the ready stream.
 * @param {Object} source A source object
 * @param {JetLog} errLog An cause log to stream messages to
 * @return {MeasurementsObject} Measurements object including the stream
 */
export async function getMeasurementsFromSource (source, {dryrun, strict}) {
  const out = new DataStream();
  const failures = {};

  try {
    const adapter = await getAdapterForSource(source);
    log.debug(`Looking up adapter for source "${source && source.name}"`);
    if (!adapter) {
      out.raise(new FetchError(ADAPTER_NOT_FOUND, source, null, 0));
    } else {
      const rawMeasurements = await getStreamFromAdapter(adapter, source);

      rawMeasurements
        .use(fixMeasurements, source, failures)
        .use(validateMeasurements, source)
        .pipe(out)
      ;
    }
  } catch (e) {
    out.raise(new FetchError(ADAPTER_ERROR, source, e, 0));
  }

  return createFetchObject(out, source, failures, dryrun);
}

export function printDataToLog (stream, log) {
  return stream
    .each(m => log.debug(JSON.stringify(m)))
    .map(data => ({data}))
  ;
}
