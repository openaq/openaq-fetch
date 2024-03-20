import log from './logger.js';
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
 * @param {URL} apiURL
 * @param {String} webhookKey
 */
export function reportAndRecordFetch (fetchReport, sources, env) {
    return async (results) => {
        fetchReport.results = results;
        fetchReport.timeEnded = Date.now();
        fetchReport.errors = results.reduce((acc, {failures}) => {
            Object.entries(failures).forEach(([key, count]) => {
                acc[key] = (acc[key] || 0) + count;
            });
            return acc;
        }, {});


        const failures = fetchReport.results
              .filter(r => !r.count);

        const successes = fetchReport.results
              .filter(r => r.count > 0);

        failures.map(r => {
            log.debug(r);
        });
        log.info(`Dry run finished with ${successes.length} successes and ${failures.length} failures in ${(fetchReport.timeEnded - fetchReport.timeStarted)/1000} seconds`);

        if (!env.dryrun) {
		        await publish(fetchReport.results, 'fetcher/success');
        }

        return 0;
    };
}