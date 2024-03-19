import { handler as fetcher } from './fetch.js';
import { handler as scheduler } from './scheduler.js';
import { SQS } from '@aws-sdk/client-sqs';
import { sourcesArray } from './sources/index.js';
import _env from './lib/env.js';
import log from './lib/logger.js';


const env = _env();

// submit a new set
(async () => {
  if (env.deployments) {
    console.log(`Testing the scheduler with ${env.deployments}`);
    let sqs = await scheduler({}, {});
    let deployments = env.deployments.split(',');
    sqs = sqs.filter(s => deployments.includes('all')||deployments.includes(s.name));
	  // now for each of these run them through the fetcher
    sqs.map(q => fetcher(q, null));
  } else {
    console.log(`Testing the fetcher directly`);
			let sources = [];
			if (env.source) {
					log.info(`Getting source from env variable source ${env.source}`);
					sources = sourcesArray.filter(
							(d) => d.name === env.source
					);
			} else {
					log.info(`Using ${sourcesArray.filter(s => s.active).length} active sources from ${sourcesArray.length} total`);
					sources = sourcesArray.filter(s => s.active);
			}

		fetcher({
				Records: [
						{
                messageId: 'local_testing',
                body: { sources }
            }
				]
		});
  }
})();
