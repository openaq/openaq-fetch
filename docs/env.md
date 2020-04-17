## Environment values affecting the process

* `API_URL` - webhook API url
* `WEBHOOK_KEY` - webhook security key
* `PROCESS_TIMEOUT` - maximum number of **milliseconds** the process can be run
* `AWS_BUCKET_NAME` - the bucket name where the raw data should be saved
* `S3_CHUNK_SIZE` - controls the size of a single s3 write in bytes - default: 1048576 (1MB)
* `SAVE_TO_S3` - toggle save to s3 (set this to `true` or `1`) - default: false
* `STRICT` - toggle strict mode, i.e. die on all errors (set this to `true` or `1`) - default: false
* `MAX_PARALLEL_ADAPTERS` - limit number of adapters running in parallel - default is practially all at the same time
* `PSQL_HOST`, `PSQL_PORT`, `PSQL_USER`, `PSQL_PASSWORD`, `PSQL_DATABASE`, `PSQL_POOL_MIN`, `PSQL_POOL_MAX` - Postgre connection data.
* `LOG_LEVEL` - Log level (see Winston logger for details)
* `LOG_COLOR` - Should log be colored? (set this to `true` or `1`)

## Argv

```bash
Example: node . -d -s 'Beijing US Embassy'

Logging options:
  --quiet, -q      Show no logging at all                              [boolean]
  --important, -1  Show only warnings and errors.                      [boolean]
  --verbose, -v    Show additional logging information (in dry run mode it shows
                   all measurements)                                   [boolean]
  --debug, -b      Show lots additional logging information (more than verbose)
                                                                       [boolean]

Main options:
  --dryrun, -d  Run the fetch process but do not attempt to save to the database
                and instead print to console, useful for testing.      [boolean]
  --source, -s  Run the fetch process with only the defined source using source
                name.
  --strict, -S  Strict checking - first error will make the process die.
                                                                       [boolean]
```
