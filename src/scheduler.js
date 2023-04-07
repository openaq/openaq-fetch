import { SQS } from '@aws-sdk/client-sqs';
import { sourcesArray } from './sources';
import { deploymentsArray } from './deployments';

export async function handler (event, context) {
  // default to all active sources
  const sqs = new SQS();

  // start by checking for deployments, if we dont have one
  // we create one for consistancy

  if (deploymentsArray.length === 0) {
    deploymentsArray.push({
      name: 'main',
      source: process.env.SOURCE,
      adapter: process.env.ADAPTER,
      resolution: process.env.RESOLUTION
    });
  }

  // now filter down to the deployments that need to run right now

  return await Promise.all(
    deploymentsArray
      .filter((d) => !d.resolution || d.resolution === '1h')
      .map(async (d) => {
        let sources = sourcesArray.filter((d) => d.active);
        if (d.resolution) {
          sources = sources.filter(
            (s) => s.resolution === d.resolution
          );
        }
        if (d.source) {
          // assume you want it event its marked inactive
          sources = sourcesArray.filter((s) => s.name === d.source);
          // only run one adapter
        } else if (d.adapter) {
          sources = sources.filter((s) => s.adapter === d.adapter);
        }
        try {
          d.suffix = `${d.name}_`;
          d.sources = sources;
          await sqs
            .sendMessage({
              MessageBody: JSON.stringify(d),
              QueueUrl: process.env.QUEUE_NAME
            })
            .then((res) => {
              console.log(res.MessageId);
              return res.messageId;
            })
            .catch((err) => {
              console.log(err);
            });
        } catch (err) {
          console.error(`Failed to send message: ${err}`);
        }
      })
  );
}
