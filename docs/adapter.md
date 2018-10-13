## OpenAQ Adapter

An Adapter is a simple node.js module that is run by `openaq-fetch` in order to retrieve list of measurements
for a specific [source](./source.md).

### Interface

Adapter must expose an object in `module.exports` containing the following properties:

* `name (String)` - the adapter name, also used as a default value for `location`.

The adapter should expose one the following methods:

* `async fetchStream(source : Source) : Array|Iterable|AsyncGeneratorFunction|GeneratorFunction|AsyncFunction|Function|Readable`
  * The function is asynchronous.
  * Any of the return types will be transformed into a stream.
  * The returned object *must* contain a `name : String` property.

* `fetchData(source : Source, callback : Function) : void`
  * The method should not return a value.
  * Callback must be called with optional `error? : Error` as first argument, `data : Measurements` as second.

### Error handling

All errors raised in an adapter are handled with only a warning as stream errors, that is:

* An adapter fetch error (thrown as the `FetchError` class).
* An asynchronous error in the `fetchStream` method.
* Wrong data format returned (not an array, data stream, generator etc.) by `fetchStream` or `fetchData`.
* Adapter not found.
* Measurement validation error.

What may not be ignored:

* Adapter runtime errors leading to unhandled exception - you're safe as long the error is in an asynchronous code or rejects as a promise.
* Adapter syntax error.

For development reasons a `--strict` mode can be switched on on the command line - then any error should be thrown.

### Measurement format

The measurement format in general must conform to [measurement schema](../lib/measurement-schema.json).

Expected data format from the adpater is like below, one measurements array with all measurements to be
included. Measurements may be expressed in the following units:

* `ppm` - parts per million (1 / 10⁶)
* `pphm` - parts per hundred million (1 p / 10⁺⁸)
* `ppb` - parts per (short) billion (1 p / 10⁺⁹)
* `ppt` - parts per (short) trillion (1 p / 10⁺¹²)
* `µg/m³` - micrograms per cubic meter (10⁻⁶ g / 1 m³)
* `mg/m³` - milligrams per cubic meter (10⁻³ g / 1 m³)

The `openaq-fetch` process will convert the units to base varialbles. Unit conversion does also include some
simple transliteration, therefore units in `ug/m3` are also accepted. For specific info please refer to `unifyMeasurementUnits` method exported by [lib/utils module](../lib/utils.js).

In streaming version the data exposed should look like:

```javascript
out = new PassThrough(...);
out.name = "Source name";

out.write({ parameter: 'pm10',
  date: {
      utc: Thu Jul 23 2015 06:40:00 GMT-0400 (EDT), // type Date.
      local: '2015-07-23T07:40:00-03:00' // type String
    },
  coordinates: {
    latitude: 45, // type Number - latitude (northing) coordinate expressed in degrees
    longitude: 40 // type Number - longitude (easting) coordinate expressed in degrees
  },
  value: 63, // type Number - the air quality measurement
  unit: 'µg/m3', // type String - unit in which the reading is expressed
  attribution: [{name: 'Attribution 1', url: 'http://example.com'}, {name: 'Attribtuion 2', url: 'http://example2.com'}], // type Array<Object> - list of attribution that should be displayed with the measurement.
  averagingPeriod: {
    unit: 'hours', // type String - units
    value: 0.25 // type Number - the size of the averaging period
  }
});
// ...and more writes.
```

and in legacy version (due to memory limitations the version above is preferred):

```javascript
{
  "name": "Source Name",
  "measurements": [
    { parameter: 'pm10',
      date: {
          utc: Thu Jul 23 2015 06:40:00 GMT-0400 (EDT),
          local: '2015-07-23T07:40:00-03:00'
        },
      coordinates: {
        latitude: 45,
        longitude: 40
      },
      value: 63,
      unit: 'µg/m3',
      attribution: [{name: 'Attribution 1', url: 'http://example.com'}, {name: 'Attribtuion 2', url: 'http://example2.com'}],
      averagingPeriod: {unit: 'hours', value: 0.25}
    },
    { parameter: 'pm25',
      date: {
          utc: Thu Jul 23 2015 06:40:00 GMT-0400 (EDT),
          local: '2015-07-23T07:40:00-03:00'
        },
      coordinates: {
        latitude: 45,
        longitude: 40
      },
      value: 26,
      unit: 'µg/m3',
      attribution: [{name: 'Attribution 1', url: 'http://example.com'}, {name: 'Attribtuion 2', url: 'http://example2.com'}],
      averagingPeriod: {unit: 'hours', value: 0.25}
    }
    // ...and more items.
  ]
}
```

Valid parameter values are pm25, pm10, so2, no2, co, o3, and bc (black carbon).
These are available internally via utils.acceptableParameters
All other values will be ignored.

Date should be provided as UTC and local. moment.js can be used to handle time zone
conversions. List of valid zone names at
https://en.wikipedia.org/wiki/List_of_tz_database_time_zones.

### Benchmark

There's an adapter benchmark script than can generate a markdown document with information
about the cpu and memory usage as well as total time of execution.

```bash
node .build_scripts/bench-adapters > docs/adapter-benchmark.md
```
