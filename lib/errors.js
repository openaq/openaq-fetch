// Symbol exports
export const MEASUREMENT_ERROR = Symbol('Measurement error');
export const MEASUREMENT_ERROR_COUNT = Symbol('Measurement error');
export const ADAPTER_NOT_FOUND = Symbol('Adapter not found');
export const ADAPTER_ERROR = Symbol('Adapter error');
export const ADAPTER_NAME_INVALID = Symbol('Adapter name invalid');

export const STREAM_END = Symbol('End stream');

export const ignore = () => 0;

export class FetchError extends Error {
  constructor (symbol, source, cause, exitCode) {
    if (cause instanceof FetchError) return cause;

    let msg = symbol.toString();
    msg = msg.substring(7, msg.length - 1) + (source ? ` (source: ${source.name})` : '');
    if (cause instanceof Error) {
      msg += ': ' + cause.message;
    }
    super(msg);

    this.source = source;
    this.type = symbol;
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
