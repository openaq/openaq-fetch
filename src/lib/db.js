import S3UploadStream from 's3-upload-stream';
//import { DataStream } from 'scramjet';
import sj from 'scramjet';
const { DataStream } = sj;
import { PassThrough } from 'stream';
import log from './logger.js';
import { ignore } from './utils.js';
import { cleanup } from './errors.js';
import { S3 } from "@aws-sdk/client-s3";

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
    try {

      const upload = S3UploadStream(s3).upload({
        Bucket: bucketName,
        Key: key
      });

      // 1 MB - means there's a limit of 10GB per upload!
      upload.maxPartSize(s3ChunkSize);
      upload.concurrentParts(5);
      upload.on('uploaded', (details) => {
        log.info(`Uploaded to s3://${details.Bucket}/${details.Key}`);
      });

      upload.on('part', ({ receivedSize, uploadedSize }) => {
        const us = (uploadedSize * 1e-6).toFixed(3);
        const rs = (receivedSize * 1e-6).toFixed(3);
        log.debug(
          `Uploading data to s3://${bucketName}/${key} -> uploadedSize: ${us}MB, receivedSize: ${rs}MB`
        );
      });

      stream
        .empty(() => {
          log.info('Empty stream');
          return reject(new Error('Empty stream'));
        })
        .JSONStringify('\n')
        .pipe(upload)
        .on('error', (e) => {
          log.error(e);
          reject(e);
        })
        .on('uploaded', resolve);
    } catch (e) {
      log.error(e);
      return reject(e);
    }
  });

  return [];
}

/**
 * Streams measurements to database and cloud storage
 *
 * @param {OpenAQEnv} env
 * @param {String} bucketName
 */
export function streamMeasurementsToDBAndStorage (sourcesStream, {
  doSaveToS3,
  s3ChunkSize,
  dryrun,
  bucketName,
  key,
}) {
  if (dryrun) {
    log.info(`[Dry Run] File would be saved to ${key}`);
    return sourcesStream.do(async ({ stream: measurementStream }) => {
      return measurementStream
        //.do(m => console.log(m))
        .run();
    });
  } else {
    const output = new DataStream();
    const s3 = new S3();

    let s3stream = null;
    if (doSaveToS3) {
      s3stream = saveResultsToS3(output, s3, bucketName, key, s3ChunkSize);
    }

    sourcesStream
      .map(async (item) => {
        const { stream: measurementStream } = item;
        await (doSaveToS3 ? s3stream.pull(measurementStream) : measurementStream.run());
        return item;
      })
      .pipe(output);

    return output;
  }
}
