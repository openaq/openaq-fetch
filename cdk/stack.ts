import * as cdk from '@aws-cdk/core';
import * as events from "@aws-cdk/aws-events";
import * as eventTargets from "@aws-cdk/aws-events-targets";
import * as lambda from "@aws-cdk/aws-lambda";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import * as s3 from "@aws-cdk/aws-s3";
import * as sqs from "@aws-cdk/aws-sqs";
import { execSync } from "child_process";
import { copyFileSync, readdirSync } from 'fs';

interface StackProps extends cdk.StackProps {
    env: object;
}

export class RealtimeFetcherStack extends cdk.Stack {
    constructor(
        scope: cdk.App,
        id: string,
        { env, ...props }: StackProps
    ){
        super(scope, id, props);
        // add the package.json file
        copyFileSync('../package.json', '../src/package.json');
        // add the node modules
        const cmd = [
            "yarn",
            "--prod",
            "--frozen-lockfile",
            `--modules-folder ../src/node_modules`,
        ].join(" ");
        execSync(cmd);
        env.QUEUE_NAME = `${id}-queue`;

        const bucket = s3.Bucket.fromBucketName(this, "Data", env.AWS_BUCKET_NAME);

        const queue = new sqs.Queue(this, "RealtimeFetcherQueue", {
            queueName: env.QUEUE_NAME,
            visibilityTimeout: cdk.Duration.seconds(1800),
        });

        const scheduler = new lambda.Function(
            this,
            `${id}-scheduler-lambda`,
            {
                description: `Scheduler for ${id}-fetcher`,
                code: lambda.Code.fromAsset(
                    '../src'
                ),
                handler: 'scheduler.handler',
                memorySize: 128,
                runtime: lambda.Runtime.NODEJS_14_X,
                timeout: cdk.Duration.seconds(30),
                environment: env,
            });

        const fetcher = new lambda.Function(
            this,
            `${id}-fetcher-lambda`,
            {
                description: `Fetcher for ${id}`,
                code: lambda.Code.fromAsset(
                    '../src'
                ),
                handler: 'fetch.handler',
                memorySize: 1024,
                runtime: lambda.Runtime.NODEJS_14_X,
                timeout: cdk.Duration.seconds(900),
                environment: env,
            });

        bucket.grantReadWrite(fetcher)
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
