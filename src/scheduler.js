//const AWS = require('aws-sdk');
import { SQS } from "@aws-sdk/client-sqs";
//const sqs = new AWS.SQS();
import sources_list from './sources/index.cjs';
import moment from 'moment';

export async function handler(event, context) {
  // default to all active sources
  let sources = sources_list.filter(d=>d.active);
  const sqs = new SQS();
  //const datetime = moment().format('YYYY-MM-DD hh:mm:ss');
  // only run one time interval/resolution
  console.log(event)
  if(process.env.RESOLUTION) {
    sources = sources.filter(d=>d.resolution == process.env.RESOLUTION);
  }
  // only run one adapter
  if(process.env.ADAPTER) {
    sources = sources.filter(d=>d.adapter == process.env.ADAPTER);
  }
  // if we pass the source than we can override the active flag
  // we do that by going back to the sources list
  if(event.source && event.source != 'aws.events') {
    sources = sources_list.filter(d=>d.name == event.source);
  } else if(process.env.SOURCE) {
    sources = sources_list.filter(d=>d.name == process.env.SOURCE);
  }
  //sources = sources.map( source => ({
  //  ...source,
  //  datetime,
  //}));

  console.debug(`Scheduling ${sources.length} sources`);

  try {
    //console.log(source);
    await sqs.sendMessage({
      MessageBody: JSON.stringify(sources),
      QueueUrl: process.env.QUEUE_NAME,
    }).then( res => {
      console.debug(res.MessageId);
    });
  } catch (err) {
    console.error(`Failed to send message: ${err}`);
  }
};
