import { handler as fetcher } from './fetch.js';
import { handler as scheduler } from './scheduler.js';
import { SQS } from '@aws-sdk/client-sqs';
import _env from './lib/env.js';

const env = _env();

// submit a new set
(async () => {
  if (env.deployments) {
    console.log(`Testing the scheduler with ${env.deployments}`)
    let sqs = await scheduler({}, {});
    let deployments = env.deployments.split(',')
    sqs = sqs.filter(s => deployments.includes('all')||deployments.includes(s.name))
	  // now for each of these run them through the fetcher
    sqs.map(q => fetcher(q, null));
  } else {
    console.log(`Testing the fetcher directly`)
    fetcher();
  }
})();
