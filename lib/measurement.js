import { promisify } from 'util';
import { DataStream } from 'scramjet';
import { validate } from 'jsonschema';
import log from './logger';
import { ADAPTER_ERROR, MeasurementValidationError, handleMeasurementErrors, AdapterError } from './errors';
import { getAdapterForSource } from './adapters';
import { ignore, unifyMeasurementUnits, removeUnwantedParameters, unifyParameters } from './utils';
import moment from 'moment';

const measurementSchema = require('./measurement-schema');

export async function getStreamFromAdapter (adapter, source) {
  log.info(`Getting stream for "${source.name}" from "${adapter.name}"`);

  if (!adapter.fetchStream) {
    const data = await promisify(adapter.fetchData)(source);
    const out = DataStream.from(data.measurements);
    out.name = data.name;
    return out;
  }

  return DataStream.from(adapter.fetchStream, source);
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
 *
 * @returns {MeasurementObject}
 */
export function createFetchObject (input, source, failures, dryRun) {
  let fetchEnded = NaN;
  let count = 0;

  const stream = input
    .do(() => count++)
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

export function normalizeDate (measurement) {
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

export function fixMeasurements (stream, source) {
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
        throw new MeasurementValidationError(source, {measurement, errors: v.errors});
      }
    }
  );

  return out;
}

/**
 * Create a function to ask the adapter for cause, verify the cause and output the ready stream.
 *
 * What it does:
 *
 * @param {Object} source A source object
 * @param {JetLog} errLog An cause log to stream messages to
 * @return {MeasurementObject} Measurements object including the stream
 */
export async function getCorrectedMeasurementsFromSource (source, {dryrun}) {
  const failures = {};
  const input = new DataStream();

  const output = input
    .use(fixMeasurements, source)
    .use(validateMeasurements, source)
    .use(removeUnwantedParameters)
    .use(handleMeasurementErrors, failures, source);

  try {
    log.debug(`Looking up adapter for source "${source && source.name}"`);
    const adapter = await getAdapterForSource(source);

    log.debug(`Fetching stream for "${source && source.name}" from adapter "${adapter.name}"`);
    (await getStreamFromAdapter(adapter, source)).pipe(input)
    ;
  } catch (cause) {
    input.raise(cause instanceof AdapterError ? cause : new AdapterError(ADAPTER_ERROR, source, cause));
  }

  return createFetchObject(output, source, failures, dryrun);
}

export function printDataToLog (stream, log) {
  return stream
    .each(m => log.debug(JSON.stringify(m)))
    .map(data => ({data}))
  ;
}
