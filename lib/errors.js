import { DataStream } from 'scramjet';
import log from './logger';

// Symbol exports
export const MEASUREMENT_ERROR = Symbol('Measurement error');
export const MEASUREMENT_INVALID = Symbol('Measurement invalid');
export const MEASUREMENT_ERROR_COUNT = Symbol('Measurement error');
export const ADAPTER_NOT_FOUND = Symbol('Adapter not found');
export const ADAPTER_ERROR = Symbol('Adapter error');
export const ADAPTER_NAME_INVALID = Symbol('Adapter name invalid');

export const STREAM_END = Symbol('End stream');

const typeName = (symbol) => symbol.toString().substring(7, symbol.toString().length - 1);

export class FetchError extends Error {
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

    this.constructor = FetchError;
    this.__proto__ = FetchError.prototype;  // eslint-disable-line
  }

  is (symbol) {
    return this.type === symbol;
  }

  get stack () {
    let err = super.stack;
    if (this.cause instanceof Error) {
      err += `\n -- caused by --\n${this.cause.stack}`;
    }
    return err;
  }
}

export class MeasurementValidationError extends FetchError {
  constructor (source, message, instance, exitCode = 0) {
    super(MEASUREMENT_INVALID, source, null, exitCode);

    if (typeof message === 'string') {
      this.validation = {errors: [{message, instance}]};
      this.message += ' ' + message;
    } else {
      this.validation = message;
    }

    this.constructor = MeasurementValidationError;
    this.__proto__ = MeasurementValidationError.prototype;  // eslint-disable-line
  }
}

export function forwardErrors (parent, {strict}) {
  return parent.do(
    ({stream}) => stream.catch(async (error) => {
      console.log(error);
      if (strict) try { await parent.raise(error); } finally {}

      return DataStream.filter;
    })
  );
}

/**
 * Handles measurement errors by pushing the output to an cause log and resolving it if the cause is resolvable.
 *
 * @param {DataStream} stream
 * @param {JetLog} errLog
 */
export function handleMeasurementErrors (stream, failures) {
  return stream
    .catch(({cause}) => {
      if (cause instanceof FetchError) {
        if (cause.exitCode) {
          throw cause;
        }

        if (cause.validation && cause.validation.errors) {
          cause.validation.errors.forEach(cause => {
            log.debug('Validation error', cause.message, cause.instance);
            failures[cause] = (failures[cause] || 0) + 1;
          });
        } else {
          log.verbose(cause.cause ? cause.cause.stack : cause.stack);
          const message = `${cause.typeName}: ${(cause.cause && cause.cause.message) || 'Unknown'}`;
          failures[message] = (failures[message] || 0) + 1;
        }

        return DataStream.filter;
      }
      throw cause;
    });
}

export async function handleWarnings (list, strict) {
  if (strict) {
    const e = await new Promise((resolve) => {
      process.on('warning', e => list.includes(e.name) && resolve(e));
    });

    throw e;
  } else {
    return new Promise(() => 0); // never resolve
  }
}

export async function handleUnresolvedPromises (strict) {
  if (strict) {
    const e = await new Promise((resolve, reject) => {
      process.on('unhandledRejection', e => reject(e));
    });
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
    } else {
      log.error(`Runtime error occurred in ${error.stream && error.stream.name}: ${error.stack}`);
    }

    return (cause && cause.exitCode) || 100;
  };
}

export function rejectOnTimeout (timeout, value) {
  return new Promise((resolve, reject) => setTimeout(() => reject(value), timeout));
}

export function resolveOnTimeout (timeout, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), timeout));
}

export async function handleProcessTimeout (processTimeout, runningSources) {
  await resolveOnTimeout(processTimeout);

  const unfinishedSources = Object.entries(runningSources)
    .filter(([, v]) => v !== 'finished' && v !== 'filtered')
    .map(([k]) => k);

  log.error(`Still running sources at time out: ${unfinishedSources}`);

  throw new Error('Process timed out');
}
