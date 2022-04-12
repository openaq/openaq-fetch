import * as cdk from '@aws-cdk/core';
import * as lambda from "@aws-cdk/aws-lambda";
import * as s3 from "@aws-cdk/aws-s3";
import { execSync } from "child_process";
import { readFileSync, copyFileSync, readdirSync } from 'fs';
//import { readEnvFromLocalFile } from '../src/lib/env.js';


const env = {
    // testing for one source to start
    SOURCE: "London Air Quality Network",
}
const reserved_keys = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
]
let envs = readFileSync('../src/.env', 'utf8');
envs.split('\n').forEach(function (e) {
    if (e) {
        let idx = e.indexOf('=');
        let name = e.substr(0, idx);
        let value = e.substr(idx + 1, e.length);
        if(!env[name] && !reserved_keys.includes(name)) {
            env[name] = value;
        }
    }
});

const app = new cdk.App();

export class RealtimeFetcherStack extends cdk.Stack {
    constructor(
        scope: cdk.App,
        id: string, props?: cdk.StackProps
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

        const bucket = s3.Bucket.fromBucketName(this, "Data", env.AWS_BUCKET_NAME);
        const handler = new lambda.Function(
            this,
            `${id}-lambda`,
            {
                description: "Lambda implementation of the realtime fetcher",
                code: lambda.Code.fromAsset(
                    '../src'
                ),
                handler: 'fetch.handler',
                memorySize: 512,
                runtime: lambda.Runtime.NODEJS_14_X,
                timeout: cdk.Duration.seconds(300),
                environment: env,
            });

        bucket.grantReadWrite(handler)

    }
}



const stack = new RealtimeFetcherStack(app, 'realtime-fetcher')