import * as cdk from 'aws-cdk-lib';
import {
  aws_events as events,
  aws_events_targets as eventTargets,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_sqs as sqs,
} from 'aws-cdk-lib';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { execSync } from 'child_process';
import { copyFileSync, readdirSync } from 'fs';


interface keyable {
    [key: string]: string
}

interface StackProps extends cdk.StackProps {
  env: keyable;
}

export class RealtimeFetcherStack extends cdk.Stack {
  constructor(
    scope: cdk.App,
    id: string,
    { env, ...props }: StackProps
  ) {
    super(scope, id, props);
    // add the package.json file
    copyFileSync('../package.json', '../src/package.json');
    // add the node modules
    const cmd = [
      'yarn',
      '--prod',
      '--cwd ../src',
      '--frozen-lockfile',
      `--modules-folder ../src/node_modules`,
    ].join(' ');
    execSync(cmd);
    env.QUEUE_NAME = `${id}-queue`;

    const bucket = s3.Bucket.fromBucketName(
      this,
      'Data',
      env.AWS_BUCKET_NAME
    );

    const queue = new sqs.Queue(this, 'RealtimeFetcherQueue', {
      queueName: env.QUEUE_NAME,
      visibilityTimeout: cdk.Duration.seconds(1800),
    });

    const scheduler = new lambda.Function(
      this,
      `${id}-scheduler-lambda`,
      {
        description: `Scheduler for ${id}-fetcher`,
        code: lambda.Code.fromAsset('../src'),
        handler: 'scheduler.handler',
        memorySize: 128,
        runtime: lambda.Runtime.NODEJS_14_X,
        timeout: cdk.Duration.seconds(30),
        environment: env,
      }
    );

    const fetcher = new lambda.Function(
      this,
      `${id}-fetcher-lambda`,
      {
        description: `Fetcher for ${id}`,
        code: lambda.Code.fromAsset('../src'),
        handler: 'fetch.handler',
        memorySize: 1024,
        runtime: lambda.Runtime.NODEJS_14_X,
        timeout: cdk.Duration.seconds(900),
        environment: env,
      }
    );

    bucket.grantReadWrite(fetcher);
    queue.grantSendMessages(scheduler);
    queue.grantConsumeMessages(fetcher);

    fetcher.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 1,
      })
    );

    // finally we create our cron/event
    new events.Rule(this, `${id}-scheduler-cron`, {
      schedule: events.Schedule.rate(cdk.Duration.minutes(60)),
      targets: [new eventTargets.LambdaFunction(scheduler)],
    });
  }
}
