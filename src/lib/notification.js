import request from 'request';
import log from './logger.js';
import { promisify } from 'util';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient();

async function publish(message, subject) {
		// the following just looks better in the log
		if(process.env.TOPIC_ARN) {
				const cmd = new PublishCommand({
						TopicArn: process.env.TOPIC_ARN,
						Subject: subject,
						Message: JSON.stringify(message),
				});
				await sns.send(cmd);
		}
}

/**
 * Reports and saves fetch information.
 *
 * @param {FetchReport} fetchReport
 * @param {Source[]} sources
 * @param {Object} argv
 */
export function reportAndRecordFetch (fetchReport, sources, argv) {
  return async (results) => {
    fetchReport.results = results;
    fetchReport.timeEnded = Date.now();
    fetchReport.errors = results.reduce((acc, {failures}) => {
      Object.entries(failures).forEach(([key, count]) => {
        acc[key] = (acc[key] || 0) + count;
      });
      return acc;
    }, {});

    if (argv.dryrun) {
      log.info(fetchReport);
      log.info('Dry run ended.');
      return 0;
    }
  };
}
