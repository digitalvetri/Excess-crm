#!/usr/bin/env tsx
import { config } from 'dotenv';
config({ path: '.env.local' });

const REQUIRED: string[] = [
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_SECRET',
  'VAPI_API_KEY',
  'VAPI_WEBHOOK_SECRET',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'RESEND_API_KEY',
  'AWS_REGION',
  'S3_BUCKET_RECORDINGS',
  'ANTHROPIC_API_KEY',
];

const OPTIONAL: string[] = [
  'DATADOG_API_KEY',
  'SENTRY_DSN',
  'EXOTEL_API_KEY',
  'ELEVENLABS_API_KEY',
];

let missing = 0;

console.log('🔍 Validating environment variables...\n');

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`  ❌ MISSING (required): ${key}`);
    missing++;
  } else {
    console.log(`  ✅ ${key}`);
  }
}

console.log('');
for (const key of OPTIONAL) {
  if (!process.env[key]) {
    console.warn(`  ⚠️  MISSING (optional): ${key}`);
  } else {
    console.log(`  ✅ ${key}`);
  }
}

console.log('');
if (missing > 0) {
  console.error(`❌ ${missing} required variable(s) missing. Fix before deploying.\n`);
  process.exit(1);
} else {
  console.log('✅ All required variables present.\n');
}
