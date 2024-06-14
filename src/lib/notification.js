import request from 'request';
import log from './logger.js';
import { promisify } from 'util';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient();

/**
* Ping openaq-api to let it know cause fetching is complete
* @param {function} cb A function of form func(cause) called on completion
*/
async function sendUpdatedWebhook (apiURL, webhookKey) {
  var form = {
    key: webhookKey,
    action: 'DATABASE_UPDATED'
  };
  return promisify(request.post)(apiURL, { form: form });
}

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
export function reportAndRecordFetch (fetchReport, sources, env, apiURL, webhookKey) {
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
        log.info(`Finished with ${successes.length} successes and ${failures.length} failures in ${(fetchReport.timeEnded - fetchReport.timeStarted)/1000} seconds`);

        if (!env.dryrun) {
		        await publish(fetchReport.results, 'fetcher/success');
        } else {
            // for dev purposes
            failures.map(r => console.warn(`No results`, r));
            fetchReport.results.map( r => log.debug(`${r.locations} locations of ${Object.keys(r.parameters).length} parameters from ${r.from} - ${r.to} | Parameters for ${r.sourceName}`, r.parameters));
        }
        return 0;
    };
}
