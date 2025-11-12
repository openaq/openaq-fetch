import { SQS } from '@aws-sdk/client-sqs';
import { sourcesArray } from './sources/index.js';
import { deploymentsArray } from './deployments.js';
import _env from './lib/env.js';

const env = _env();

/**
 * This is the entry point for the schedular lamdba. The purpose is to create a
 * new message (SQS) for each deployment found in the deploymentsArray.
 * Each message will then be handled by an invocation of the fetch lambda found in
 * fetch.js
 */
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
				// start by assuming that we are running them all and therefor
        // remove the inactive ones
        let sources = sourcesArray.filter((d) => d.active);
        // if the deployment has specified a spsecific source than we
        // assume you want it event its marked inactive
        if (d.source) {
          sources = sourcesArray.filter((s) => s.name === d.source);
          // or if you have want to run run only one adapter
          // source and adapter cant be run together
        } else if (d.adapter) {
          // this will only return active sources from the adapter
          sources = sources.filter((s) => s.adapter === d.adapter);
        }
        // finally, if the deployment has a resolution
        // use that to filter those sources down
        if (d.resolution) {
          sources = sources.filter(
            (s) => s.resolution === d.resolution
          );
        }

        try {
          d.suffix = `${d.name}_`;
          d.sources = sources;
          let body = JSON.stringify(d)

          if (env.dryrun || env.local) {
            console.log(`${d.name} with ${d.sources.length} sources`)
            let messageId = 'fake-message-id';
            let event = { name: d.name, Records: [{ body, messageId }] }
            return event
          } else {
            await sqs
              .sendMessage({
                MessageBody: body,
                QueueUrl: process.env.QUEUE_NAME
              })
              .then((res) => {
                return res.messageId;
              })
              .catch((err) => {
                console.log(err);
              });
          }
        } catch (err) {
          console.error(`Failed to send message: ${err}`);
        }
      })
  );
}
