import { handler as fetcher } from './fetch.js';
import { handler as scheduler } from './scheduler.js';
import { SQS } from "@aws-sdk/client-sqs";

const event = {
    Records: [
        {
            messageId: '9a70768a-3a75-4690-b1b8-8742264ff4f4',
            receiptHandle: 'AQEB5sTdPJrZXryC2sRtG+cOo29FNzp/O+REZkHXZANKoaPJ9+f9nhpNIRs/GM4qoM1iWnJP1jANkUFkvfUovJ44GYYY8ja8UU7kGLu0i0Ngw9hPiIWVFNCmvZ2e/XOXKKkJvBbuKloHg0i92GjmUvsNQ/d249hW2RdHY9Y2sDu0giAi5w0USPNMxIeC1ibedxZnSKWpPngroebepIxaUDwBym29tE+L5xOtGhx6HRLR5qOWwHoiMOepecnM3Q6yhzyW6vY/AaL7DXIoXOVFCAtp0VliBVFWk8sct91dTjDbJMAx8/LEMHtKqXVyKG+Zs4zcOUMmTw1XIk50AOLgTIRQJ1XE/yWKU2bvBcPBbpvOwpPFKwYTaHNUN2ZxpLZAUhh7M0U2rZgYO3sfcOBME8grng==',
            body: '[{"url":"http://api.erg.ic.ac.uk","adapter":"laqn","name":"London Air Quality Network","country":"GB","description":"Environmental Research Group","sourceURL":"http://api.erg.ic.ac.uk/AirQuality/Information/Documentation/pdf","contacts":["info@openaq.org"],"active":true,"datetime":"2022-04-27 06:03:26"}]',
            attributes: [],
            messageAttributes: {},
            md5OfBody: 'e29b76c2f919bc4aa0863332ce0198ee',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:470049585876:realtime-fetcher-queue',
            awsRegion: 'us-east-1'
        }
    ]
};

const getMessage = async () => {
  const sqs = new SQS();
  return await sqs.receiveMessage({
    QueueUrl: process.env.QUEUE_NAME,
  }).then( ({ Messages }) => {
    if(!Messages) return [];
    try {
      // use the messageid and body but update the format
      // to fit the way that the lambda will see it
      event.Records[0].messageId = Messages[0].MessageId;
      event.Records[0].body = Messages[0].Body;
      return event;
    } catch (err) {
      console.debug(`Could not parse body: ${Messages[0].Body}`);
      console.error(err);
      return [];
    }
  });
};


// submit a new set
(async () => {
  //const res = await scheduler();
  //const event = await getMessage();
  //fetcher(event);
  fetcher();
})();
