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
		console.log('Publishing:', subject, message);
		if(process.env.TOPIC_ARN) {
				const cmd = new PublishCommand({
						TopicArn: process.env.TOPIC_ARN,
						Subject: subject,
						Message: JSON.stringify(message),
				});
				return await sns.send(cmd);
		} else {
				console.log('No publish topic', subject, message, process.env);
				return {};
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
export function reportAndRecordFetch (fetchReport, sources, argv, apiURL, webhookKey) {
  return async (results) => {
    fetchReport.results = results;
    fetchReport.timeEnded = Date.now();
    fetchReport.errors = results.reduce((acc, {failures}) => {
      Object.entries(failures).forEach(([key, count]) => {
        acc[key] = (acc[key] || 0) + count;
      });
      return acc;
    }, {});


		await publish(fetchReport.results, 'fetcher/success');

    if (argv.dryrun) {
      log.info(fetchReport);
      log.info('Dry run ended.');
      return 0;
    }

    //await sendUpdatedWebhook(apiURL, webhookKey);
    log.info('Webhook posted, have a good day!');
    return 0;
  };
}
