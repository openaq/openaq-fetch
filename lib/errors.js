import { DataStream } from 'scramjet';
import log from './logger';

// Symbol exports
export const MEASUREMENT_ERROR = Symbol('Measurement error');
export const MEASUREMENT_INVALID = Symbol('Measurement invalid');
export const ADAPTER_MODULE_INVALID = Symbol('Adapter module invalid');
export const ADAPTER_RESOLVE_ERROR = Symbol('Adapters resolving error');
export const ADAPTER_ERROR = Symbol('Adapter error');
export const ADAPTER_NOT_FOUND = Symbol('Adapter not found');
export const ADAPTER_NAME_INVALID = Symbol('Adapter name invalid');
export const DATA_URL_ERROR = Symbol('Source data url error');

export const STREAM_END = Symbol('End stream');

const typeName = (symbol) => symbol.toString().substring(7, symbol.toString().length - 1);

/**
 * An error type used to report adapter runtime
 *
 * Throwing this error means that the adapter will not output any additional data.
 * Any other error class will be automatically wrapped in this also.
 */
export class AdapterError extends Error {
  /**
   * @param {Symbol} symbol error symbol
   * @param {Source} source source on which the error occurred
   * @param {Error} [cause] an underlying error to be included in stack
   * @param {number} [exitCode] an exit code to return
   */
  constructor (symbol, source, cause, exitCode = 100) {
    const _typeName = typeName(symbol);

    let msg = _typeName + (source ? ` (source: ${source.name})` : '');
    if (cause && cause.message) {
      msg += ': ' + cause.message;
    }
    super(msg);

    this.source = source;
    this.type = symbol;
    this.typeName = _typeName;
    this.cause = cause;
    this.exitCode = exitCode;

    const stack = this.stack;
    Object.defineProperty(this, 'stack', {
      get: function () {
        let err = stack;
        if (this.cause && this.cause.stack) {
          err += `\n -- caused by --\n${this.cause.stack}`;
        }
        return err;
      }
    });

    this.constructor = AdapterError;
    this.__proto__ = AdapterError.prototype;  // eslint-disable-line
  }

  is (symbol) {
    return this.type === symbol;
  }
}

/**
 * An error type used to report a failure of part of the fetch process.
 */
export class FetchError extends Error {
  /**
   * @param {Symbol} symbol error symbol
   * @param {Source} source source on which the error occurred
   * @param {Error} [cause] an underlying error to be included in stack
   * @param {number} [extraMessage] some friendly message
   */
  constructor (symbol, source, cause, extraMessage = '') {
    const _typeName = typeName(symbol);

    super(extraMessage || '');

    this.source = source;
    this.type = symbol;
    this.typeName = _typeName;
    this.cause = cause;
    this.extraMessage = extraMessage;

    const stack = this.stack;
    Object.defineProperty(this, 'stack', {
      get: function () {
        let err = stack;
        if (this.cause && this.cause.stack) {
          err += `\n -- caused by --\n${this.cause.stack}`;
        }
        return err;
      }
    });

    this.constructor = FetchError;
    this.__proto__ = FetchError.prototype;  // eslint-disable-line
  }

  is (symbol) {
    return this.type === symbol;
  }
}

/**
 * An error type to report validation error on a single measurement.
 */
export class MeasurementValidationError extends FetchError {
  /**
   *
   * @param {Source} source
   * @param {String|JSONSchemaValidation} message
   * @param {Measurement} instance
   */
  constructor (source, message, instance) {
    super(MEASUREMENT_INVALID, source, null);

    if (typeof message === 'string') {
      this.validation = {errors: [{
        message,
        instance,
        toString () { return message; }
      }]};
      this.message += message;
    } else {
      this.validation = message;
    }

    this.constructor = MeasurementValidationError;
    this.__proto__ = MeasurementValidationError.prototype;  // eslint-disable-line
  }
}

/**
 * Forwards errors to parent stream
 *
 * @param {DataStream} stream measurements stream from one of the adapters
 * @param {DataStream} parent parent stream
 * @param {OpenAQEnv} env
 */
export function forwardErrors (stream, parent, sourceObject, failures, {strict}) {
  return stream.catch(async (error) => {
    if (strict) {
      try { await parent.raise(error); } finally {}
    } else {
      log.verbose(`Ignoring error in "${sourceObject.name}": ${error.message}`);
      failures[error.message] = (failures[error.message] || 0) + 1;
    }

    return DataStream.filter;
  });
}

/**
 * Handles measurement errors by pushing the output to an cause log and resolving it if the cause is resolvable.
 *
 * @param {DataStream} stream
 * @param {Object} failures
 * @param {Source} source
 */
export function handleMeasurementErrors (stream, failures, source) {
  return stream
    .catch(({cause}) => {
      if (cause instanceof FetchError) {
        if (cause.exitCode) {
          throw cause;
        } else if (cause.validation && cause.validation.errors) {
          cause.validation.errors.forEach(cause => {
            log.debug(`Validation error in "${source && source.name}":`, cause.message, cause.instance);
            failures[cause] = (failures[cause] || 0) + 1;
          });
        } else {
          const message = `${cause.typeName}: ${cause.extraMessage || (cause.cause && cause.cause.message) || cause.message || 'Unknown'}`;

          log.verbose(message);
          failures[message] = (failures[message] || 0) + 1;
        }

        return DataStream.filter;
      } else if (cause instanceof AdapterError) {
        throw cause;
      }

      throw new AdapterError(ADAPTER_ERROR, source, cause, 0);
    });
}

export async function handleWarnings (list, strict) {
  if (strict) {
    const e = await new Promise(resolve => process.on('warning', e => list.includes(e.name) && resolve(e)));

    throw e;
  } else {
    return new Promise(() => 0); // never resolve
  }
}

export async function handleUnresolvedPromises (strict) {
  if (strict) {
    const e = await new Promise(resolve => process.on('unhandledRejection', e => resolve(e)));

    log.debug('Unresolved promise, exiting.');
    throw e;
  } else {
    return new Promise(() => 0); // never resolve
  }
}

export function handleFetchErrors () {
  return (error) => {
    const cause = error instanceof FetchError ? error : error.cause;

    if (cause instanceof FetchError) {
      if (cause.is(STREAM_END)) return cause.exitCode || 0;
      log.error('Fetch error occurred', cause.stack);
    } else if (cause instanceof AdapterError) {
      log.error('Adapter error occurred', cause.stack);
    } else {
      log.error(`Runtime error occurred in ${error.stream && error.stream.name}: ${error.stack}`);
    }

    return (cause && cause.exitCode) || 199;
  };
}

export function rejectOnTimeout (timeout, value) {
  return new Promise((resolve, reject) => setTimeout(() => reject(value), timeout));
}

export function resolveOnTimeout (timeout, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), timeout));
}

export async function handleSigInt (runningSources) {
  await (new Promise((resolve) => process.once('SIGINT', () => resolve())));

  const unfinishedSources = Object.entries(runningSources)
    .filter(([, v]) => v !== 'finished' && v !== 'filtered')
    .map(([k]) => k)
    .join(', ');

  log.warn(`Still running sources at interruption: [${unfinishedSources}]`);

  throw new Error('Process interruped');
}

export async function handleProcessTimeout (processTimeout, runningSources) {
  await resolveOnTimeout(processTimeout);

  const unfinishedSources = Object.entries(runningSources)
    .filter(([, v]) => v !== 'finished' && v !== 'filtered')
    .map(([k]) => k);

  log.error(`Still running sources at time out: ${unfinishedSources}`);

  throw new Error('Process timed out');
}

const cleanups = [];
export async function cleanup () {
  for (let operation of cleanups) {
    try {
      log.debug(`Executing cleanup ${operation._name}`);
      await operation();
      log.debug(`Cleanup ${operation._name} completed`);
    } catch (e) {
      log.warn(`Exception "${e.message}" occured during cleanup "${operation._name}"`);
    }
  }
}

cleanup.add = (operation) => {
  operation._name = operation.name || (new Error().stack).split('\n')[2].replace(/^.*?at ([^\s]+)\s\(.*\/([^/]+)\).*$/, '$1 ($2)');
  cleanups.push(operation);
};
