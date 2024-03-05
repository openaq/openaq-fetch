import log from './logger.js';
import {
  ADAPTER_ERROR,
  MeasurementValidationError,
  handleMeasurementErrors,
  AdapterError,
  forwardErrors,
} from './errors.js';
import { getAdapterForSource } from './adapters.js';
import {
  ignore,
  unifyMeasurementUnits,
  removeUnwantedParameters,
  unifyParameters,
} from './utils.js';

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { DateTime } from 'luxon';
import { promisify } from 'util';
import { validate } from 'jsonschema';
import sj from 'scramjet';

const { DataStream } = sj;

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

const measurementSchema = JSON.parse(
  readFileSync(`./lib/measurement-schema.json`, 'utf8')
);

async function getStreamFromAdapter (adapter, source) {
  log.debug(
    `Getting stream for "${source.name}" from "${adapter.name}"`
  );

  if (!adapter.fetchStream) {
    log.debug(
      `Getting data for "${source && source.name}" from adapter "${
        adapter.name
      }"`
    );
		const fetchData = promisify(adapter.fetchData)
		const data = await fetchData(source)
					.catch(err => {
           throw new AdapterError(ADAPTER_ERROR, source, err && err.message && err.message.code)
					});
		const out = DataStream.from(data.measurements);
		out.name = data.name;
		return out;
  }

  log.debug(
    `Fetching stream for "${source && source.name}" from adapter "${
      adapter.name
    }"`
  );
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
    inserted: 0,
  };

  const stream = input.do(() => counts.total++);
  const whenDone = stream
    .whenEnd()
    .then(() => {
      fetchEnded = Date.now();
    })
    .catch(ignore);

  return {
    get fetchStarted () {
      const now = Date.now();
      log.info(`Started ${source.name} - ${now}`);
      return now;
    },
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
      return `${
        dryRun ? '[Dry Run] ' : ''
      }New measurements found for ${source.name}: ${this.count}`;
    },
    dryRun,
    stream,
    source,
    counts,
    whenDone,
    get resultsMessage() {
      return fetchEnded
        ? {
            message: this.message,
            failures: this.failures,
            count: this.count,
            duration: this.duration,
            sourceName: this.source.name,
          }
        : null;
    },
  };
}

function normalizeDate (measurement) {
  if (measurement.date) {
    if (measurement.date instanceof Date) {
      measurement.date = {
        local: DateTime.fromJSDate(measurement.date).toISO(),
      };
    }

    if (!measurement.date.utc && measurement.date.local) {
      measurement.date.utc = DateTime.fromISO(measurement.date.local).toUTC().toMillis();
    }

    if (typeof measurement.date.utc === 'string') {
      measurement.date.utc = DateTime.fromISO(measurement.date.utc).toMillis();
    } else if (measurement.date.utc instanceof Date) {
      measurement.date.utc = measurement.date.utc.getTime();
    }

    if (measurement.date.utc) {
      measurement.date.utc = DateTime.fromMillis(measurement.date.utc).toUTC().toISO();
    }
  }

  return measurement;
}

function checkLocation (measurement) {
  if (
    measurement.country === '' &&
    measurement.coordinates &&
    measurement.coordinates.latitude &&
    measurement.coordinates.longitude
  ) {
    measurement.country = '99';
  }
  return measurement;
}

function fixMeasurements (stream, source) {
  return stream
    .do(normalizeDate)
    .do(unifyMeasurementUnits)
    .do(unifyParameters)
    .do(checkLocation)
    .map(
      ({
        date,
        parameter,
        value,
        unit,
        averagingPeriod,
        location,
        city,
        country,
        coordinates,
        attribution,
        sourceType,
        sourceName,
        mobile,
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
        mobile:
          typeof mobile === 'undefined' ? !!source.mobile : mobile,
      })
    );
}

/**
 * Filter measurements from a measurement stream
 *
 * @param { DataStream<Measurement> } stream The measurements stream to prune measurements from
 * @return { DataStream<Measurement> } A stream pruned of invalid measurement objects, may be empty
 *                                   and a failures object of aggregated reasons for cause failures
 */
function validateMeasurements (stream, source) {
  const out = stream.map(async (measurement) => {
    const v = validate(measurement, measurementSchema);
    if (v.errors.length === 0) {
      return measurement;
    } else {
      throw new MeasurementValidationError(source, {
        measurement,
        errors: v.errors,
      });
    }
  });

  return out;
}

export async function getCorrectedMeasurementsFromSource (source, env) {
  if (source instanceof Error) throw source;

  const [ret] = await DataStream.from([source])
    .use(fetchCorrectedMeasurementsFromSourceStream, { strict: true })
    .toArray();

  return ret;
}

/**
 * Create a function to ask the adapter for cause, verify the cause and output the ready stream.
 *
 * @param { DataStream } stream stream of sources
 * @param { OpenAQEnv } env
 *
 */

export function fetchCorrectedMeasurementsFromSourceStream (stream, env) {
  log.debug(`Fetching corrected measurements from a stream of sources`);
  return stream.into(async (out, source) => {
    const failures = {};
    const input = new DataStream();
    let error = null;

    const output = input
      .use(fixMeasurements, source)
      .use(validateMeasurements, source)
      .use(removeUnwantedParameters)
      .use(handleMeasurementErrors, failures, source)
      .use(forwardErrors, stream, source, failures, env);

    if (env.datetime) {
      source.datetime = DateTime.fromISO(env.datetime, { zone: 'utc' });
      if (!source.datetime.isValid) {
        throw new Error('Invalid date/time');
      }
      log.debug(`Using env datetime of ${source.datetime}`);
    } else if (source.offset) {
      source.datetime = DateTime.utc().minus({ hours: source.offset });
      log.debug(`Using source offset of ${source.offset} hours to set datetime`);
    } else if (env.offset) {
      source.datetime = DateTime.utc().minus({ hours: env.offset });
      source.offset = env.offset;
      log.debug(`Using env offset of ${env.offset} hours to set datetime`);
    } else {
      log.debug(`No offset or datetime being used`);
    }

    try {
      log.debug(`Looking up adapter for source "${source && source.name}"`);
      const adapter = await getAdapterForSource(source);

      (await getStreamFromAdapter(adapter, source)).pipe(input);

      if (error) throw error;
      else error = true;
    } catch (cause) {
      await input.raise(
        cause instanceof AdapterError
          ? cause
          : new AdapterError(ADAPTER_ERROR, source, cause)
      );
      input.end();
    }

    await out.whenWrote(
      createFetchObject(output, source, failures, env.dryrun)
    );
  }, new DataStream());
}
