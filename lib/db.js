import moment from 'moment';
import { pick } from 'lodash';
import S3UploadStream from 's3-upload-stream';
import { DataStream } from 'scramjet';
import log from './logger';
import { ignore } from './utils';
import { cleanup } from './errors';


function saveResultsToS3 (output, s3, bucketName, key, s3ChunkSize) {
  const stream = new DataStream();

  const finishing = stream
    .catch(ignore)
    .map(({status, ...measurement}) => measurement)
    .use(streamDataToS3, s3, bucketName, key, s3ChunkSize)
    .run()
    .catch(e => output.raise(e));

  const endStream = () => {
    if (!ended) stream.end();
    ended = true;
  };

  let ended = false;
  output.whenEnd().then(endStream).catch(ignore);

  cleanup.add(async () => {
    endStream();
    await finishing;
  });

  return stream;
}

async function streamDataToS3 (stream, s3, bucketName, key, s3ChunkSize) {
  await new Promise((resolve, reject) => {
    if (!bucketName) throw new Error('Bucket name is required!');

    const upload = S3UploadStream(s3).upload({
      Bucket: bucketName,
      Key: key
    });

    // 1 MB - means there's a limit of 10GB per upload!
    upload.maxPartSize(s3ChunkSize);
    upload.concurrentParts(5);

    log.debug(`Uploading data to s3 "${bucketName}" as "/${key}" in "${s3ChunkSize}" fragments.`);

    stream
      .JSONStringify('\n')
      .pipe(upload)
      .on('error', (e) => {
        console.error(e);
        reject(e);
      })
      .on('uploaded', resolve);
  });

  return [];
}

/**
 * Saves information about fetches to the database
 *
 * @param {FetchResult} sources
 */
export async function saveFetches ({timeStarted, timeEnded, itemsInserted, results}) {
  // const pg = await getDB();

  // return pg('fetches')
  //   .insert([{
  //     time_started: new Date(timeStarted),
  //     time_ended: new Date(timeEnded),
  //     count: itemsInserted,
  //     results: JSON.stringify(results)
  //   }])
  //   .then(() => log.info('Fetches table successfully updated'))
  //   .catch((error) => log.error(error));
}

/**
 * Save sources information, overwritten any previous results
 *
 * @param {Sources} sources
 */
export async function saveSources (sources) {
  const inserts = Object.values(sources)
    .reduce((acc, sources) => acc.concat(sources), [])
    .filter(data => (data.adapter !== 'dummy'))
    .map(data => (pick(data, ['url', 'adapter', 'name', 'city', 'country', 'description', 'sourceURL', 'resolution', 'contacts', 'active'])))
    .map(data => ({data: JSON.stringify(data)}));

  // const pg = await getDB();
  // return pg('sources')
  //   .del()
  //   .then(() => log.verbose('Sources table successfully deleted.'))
  //   .then(() => pg('sources').insert(inserts))
  //   .then(() => log.info('Sources table successfully updated.'))
  //   .catch((e) => log.error(e));
}

/**
 * Streams measurements to database and cloud storage
 *
 * @param {OpenAQEnv} env
 * @param {String} bucketName
 */
export function streamMeasurementsToDBAndStorage (sourcesStream, {doSaveToS3, s3ChunkSize, dryrun, bucketName}) {
  if (dryrun) {
    return sourcesStream.do(async ({ stream: measurementStream }) => {
      return measurementStream
        .do(m => log.verbose(JSON.stringify(m)))
        .run();
    });
  } else {
    const output = new DataStream();

    let s3stream = null;
    if (doSaveToS3) {
      const key = `test-realtime/${moment().format('YYYY-MM-DD/X')}.ndjson`;
      s3stream = saveResultsToS3(output, new (require('aws-sdk').S3)(), bucketName, key, s3ChunkSize);
    }

    sourcesStream
      .map(async (item) => {
        const { stream: measurementStream, counts } = item;
        await (doSaveToS3 ? s3stream.pull(measurementStream) : measurementStream.run());

        return item;
      })
      .pipe(output);

    return output;
  }
}
