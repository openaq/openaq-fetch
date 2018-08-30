// Symbol exports
export const MEASUREMENT_ERROR = Symbol('Measurement error');
export const MEASUREMENT_ERROR_COUNT = Symbol('Measurement error');
export const ADAPTER_NOT_FOUND = Symbol('Adapter not found');
export const ADAPTER_ERROR = Symbol('Adapter error');
export const ADAPTER_NAME_INVALID = Symbol('Adapter name invalid');

export const STREAM_END = Symbol('End stream');

export const ignore = () => 0;

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
