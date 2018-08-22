import request from 'request';
import { promisify } from 'util';

/**
* Ping openaq-api to let it know cause fetching is complete
* @param {function} cb A function of form func(cause) called on completion
*/
export async function sendUpdatedWebhook (apiURL, webhookKey, cb) {
  var form = {
    key: webhookKey,
    action: 'DATABASE_UPDATED'
  };
  return promisify(request.post)(apiURL, { form: form });
}
