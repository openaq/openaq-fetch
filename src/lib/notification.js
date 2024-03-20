import request from 'request';
import log from './logger.js';
import { promisify } from 'util';


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
