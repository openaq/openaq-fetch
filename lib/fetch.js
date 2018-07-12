import { promisify } from 'util';
import { DataStream } from 'scramjet';
import { validate } from 'jsonschema';
import request from 'request';
import log from './logger';

import adapters from '../adapters';

const measurementSchema = require('./measurement-schema');

// Symbol exports
export const MEASUREMENT_ERROR = Symbol('Measurement error');
export const MEASUREMENT_ERROR_COUNT = Symbol('Measurement error');
export const ADAPTER_NOT_FOUND = Symbol('Adapter not found');
export const ADAPTER_ERROR = Symbol('Adapter error');

export const STREAM_END = Symbol('End stream');

export class FetchError extends Error {
  constructor (symbol, source, data, fatal = false) {
    if (data instanceof FetchError) return data;

    let msg = symbol.toString();
    msg = msg.substring(7, msg.length - 1) + (source ? ` (${source.name})` : '');
    if (data instanceof Error) {
      msg += ': ' + data.message;
    }
    super(msg);

    this.source = source;
    this.type = symbol;
    this.data = data;
    this.fatal = fatal;
  }

  is (symbol) {
    return this.symbol === symbol;
  }

  get stack () {
    let err = super.stack;
    if (this.data instanceof Error) {
      err += `\n -- caused by --\n${this.data.stack}`;
    }
    return err;
  }
}

/**
 * Find the adapter for a given source
 * @param {string} name An adapter name
 * @return {Adapter} The associated adapter
 */
export const getAdapterForSource = ({name}) => Object.values(adapters).find(a => a.name === name);

/**
* Ping openaq-api to let it know data fetching is complete
* @param {function} cb A function of form func(error) called on completion
*/
export async function sendUpdatedWebhook (apiURL, webhookKey, cb) {
  var form = {
    key: webhookKey,
    action: 'DATABASE_UPDATED'
  };
  return promisify(request.post(apiURL, { form: form }));
}

export async function getStreamFromAdapter (adapter, source) {
  if (!adapter.fetchStream) {
    const data = await promisify(adapter.fetchData)(source);
    const out = DataStream.fromArray(data.measurements);
    out.name = data.name;
    return out;
  }

  return adapter.fetchStream(source);
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

/**
 * @typedef MeasurementObject
 * @prop {number} fetchStarted timestamp (in millis) when the execution has started
 * @prop {number} [fetchEnded=NaN] timestamp (in millis) when the execution has ended or `NaN` until the fetch is running
 * @prop {number} duration number of seconds between when execution was started and when it was ended or until current timestamp if execution is still running
 * @prop {Object.<string,number>} [failures={}] a breakdown of number of errors in an object which keys reflect the error message and values the number of occurrences.
 * @prop {number} [count=NaN] the number of measurements in the stream (available after the stream is ended)
 */

/**
 * Generates a transport object based on source and output stream
 */
export function createMeasurementsObject (stream, source, isDryRun = false) {
  let fetchEnded = NaN;
  let count = 0;
  const failures = {};

  const handler = e => {
    failures[e.message] = (failures[e.message] || 0) + 1;

    log.debug('Error:', e);
    if (e && e.fatal) throw e;
    return DataStream.filter;
  };

  stream.catch(handler);

  stream.do(() => count++);
  stream.whenEnd().then(() => {
    fetchEnded = Date.now();
  }, handler);

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
      return `${isDryRun ? '[Dry Run] ' : ''}New measurements inserted for ${source.name}: ${this.count}`;
    },
    dryRun: isDryRun,
    stream,
    sourceName: source.name,
    get resultsMessage () {
      return fetchEnded
        ? {
          message: this.message,
          failures: this.failures,
          count: this.count,
          duration: this.duration,
          sourceName: this.sourceName
        }
        : null;
    }
  };
}

export function forwardErrors (parent) {
  return parent.do(
    ({stream}) => stream.catch(async e => {
      await parent.raise(e);

      return DataStream.filter;
    })
  );
}

/**
 * Handles measurement errors by pushing the output to an error log and resolving it if the error is resolvable.
 *
 * @param {DataStream} stream
 * @param {JetLog} errLog
 */
export function handleMeasurementErrors (stream, errLog) {
  stream
    .catch(async e => {
      if (e instanceof FetchError && !e.fatal) {
        return errLog.warn(e.msg, e);
      }

      await errLog.error(e.msg, e);
    });

  return stream;
}

export function fixMeasurements (stream, source) {
  return stream
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
    }));
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
 *                                   and a failures object of aggregated reasons for data failures
 */
export function validateMeasurements (stream, source) {
  const out = stream.filter(
    async measurement => {
      let v = validate(measurement, measurementSchema);

      if (v.errors.length === 0) {
        return true;
      } else {
        await out.raise(new FetchError(MEASUREMENT_ERROR, source, {measurement, errors: v.errors}));
        return false;
      }
    }
  );

  return out;
}

/**
 * Create a function to ask the adapter for data, verify the data and output the ready stream.
 * @param {Object} source A source object
 * @param {JetLog} errLog An error log to stream messages to
 * @return {MeasurementsObject} Measurements object including the stream
 */
export async function getMeasurementsObjectFromSource (source, isDryRun) {
  const out = new DataStream();

  (async () => {
    try {
      const adapter = await getAdapterForSource(source);
      if (!adapter) throw new FetchError(ADAPTER_NOT_FOUND, source);

      const rawMeasurements = await getStreamFromAdapter(adapter, source);

      rawMeasurements
        .each(raw => log.debug('-- raw:', raw))
        .use(fixMeasurements, source)
        .use(validateMeasurements, source)
        .pipe(out)
      ;
    } catch (e) {
      out.raise(new FetchError(ADAPTER_ERROR, source, e));
    }
  })();

  return createMeasurementsObject(out, source, isDryRun);
}

export function printDataToLog (stream, log) {
  return stream
    .each(m => log.debug(JSON.stringify(m)))
    .map(data => ({data}))
  ;
}
