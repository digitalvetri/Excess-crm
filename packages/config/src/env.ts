import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:8000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  PORT: z.coerce.number().default(8000),

  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/excess_crm'),
  DATABASE_URL_REPLICA: z.string().optional(),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  SESSION_SECRET: z.string().min(32).default('local-dev-secret-change-in-production-00000'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_RECORDINGS: z.string().default('excess-crm-recordings'),
  S3_BUCKET_QUOTATIONS: z.string().default('excess-crm-quotations'),
  S3_BUCKET_ASSETS: z.string().default('excess-crm-assets'),

  VAPI_API_KEY: z.string().optional(),
  VAPI_WEBHOOK_SECRET: z.string().optional(),
  VAPI_PHONE_NUMBER_ID_RESHMA_VERIFY: z.string().optional(),
  VAPI_PHONE_NUMBER_ID_KARTHIK_SALES: z.string().optional(),
  VAPI_PHONE_NUMBER_ID_RESHMA_FOLLOWUP: z.string().optional(),
  VAPI_ASSISTANT_ID_RESHMA_VERIFY: z.string().optional(),
  VAPI_ASSISTANT_ID_KARTHIK_SALES: z.string().optional(),
  VAPI_ASSISTANT_ID_RESHMA_FOLLOWUP: z.string().optional(),
  // Optional B-variant assistants for prompt A/B testing
  VAPI_ASSISTANT_ID_RESHMA_VERIFY_B: z.string().optional(),
  VAPI_ASSISTANT_ID_KARTHIK_SALES_B: z.string().optional(),
  VAPI_ASSISTANT_ID_RESHMA_FOLLOWUP_B: z.string().optional(),

  EXOTEL_ACCOUNT_SID: z.string().optional(),
  EXOTEL_API_KEY: z.string().optional(),
  EXOTEL_API_TOKEN: z.string().optional(),
  EXOTEL_SUBDOMAIN: z.string().optional(),
  EXOTEL_VIRTUAL_NUMBER: z.string().optional(),
  EXOTEL_WEBHOOK_SECRET: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID_RESHMA: z.string().optional(),
  ELEVENLABS_VOICE_ID_KARTHIK: z.string().optional(),

  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_PUBLIC_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_SIP_TRUNK_ID: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  AGENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  ENABLE_LIVEKIT: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  ANTHROPIC_API_KEY: z.string().optional(),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_WEBHOOK_APP_SECRET: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),

  INDIAMART_PULL_FALLBACK_INTERVAL_MIN: z.coerce.number().default(5),
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().default('noreply@excessindia.com'),

  DATADOG_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  ENABLE_AI_DIAL: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  DAILY_AI_CALL_CAP: z.coerce.number().default(2000),
  BUSINESS_HOURS_START: z.string().default('09:00'),
  BUSINESS_HOURS_END: z.string().default('21:00'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    process.stderr.write(`Invalid environment variables:\n${JSON.stringify(result.error.flatten().fieldErrors, null, 2)}\n`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
