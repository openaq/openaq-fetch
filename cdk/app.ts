import * as cdk from '@aws-cdk/core';
import { readFileSync } from 'fs';
import { RealtimeFetcherStack } from './stack';

const DOTENV = process.env.DOTENV || '.env';

const envs = readFileSync(`../src/${DOTENV}`, 'utf8');

interface Env {
    ID: string;
    AWS_ACCESS_KEY_ID: string,
    AWS_SECRET_ACCESS_KEY: string
  }

const env: Env = {
    ID: '',
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: ''
};

const reserved_keys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];

envs.split('\n').forEach(function (e) {
  if (e) {
    let idx = e.indexOf('=');
    let name = e.substr(0, idx);
    let value = e.substr(idx + 1, e.length);
    if (!env[name] && !reserved_keys.includes(name)) {
      env[name] = value;
    }
  }
});

const app = new cdk.App();

const stack = new RealtimeFetcherStack(app, `fetcher-${env.ID}`, {
  env,
});

cdk.Tags.of(stack).add('project', 'openaq');
cdk.Tags.of(stack).add('product', 'fetch');
cdk.Tags.of(stack).add('env', 'prod');
