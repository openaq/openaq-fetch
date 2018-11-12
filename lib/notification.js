import request from 'request';
import log from './logger';
import { promisify } from 'util';
import { saveFetches, saveSources } from './db';

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

    if (argv.dryrun) {
      log.info(fetchReport);
      log.info('Dry run ended.');
      return 0;
    }

    await Promise.all([
      saveFetches(fetchReport),
      saveSources(sources)
    ]);
    //await sendUpdatedWebhook(apiURL, webhookKey);
    log.info('Webhook posted, have a good day!');
    return 0;
  };
}
