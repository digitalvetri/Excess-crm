#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ExcessCrmStack } from '../lib/excess-crm-stack.js';

const app = new cdk.App();

new ExcessCrmStack(app, 'ExcessCrm', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] ?? 'ap-south-1',
  },
});
