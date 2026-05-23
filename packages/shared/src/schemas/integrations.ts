import { z } from 'zod';

export const justDialConfigSchema = z.object({
  secret: z.string().min(8, 'Secret must be at least 8 characters').max(128),
});

export const indiamartConfigSchema = z.object({
  apiKey: z.string().min(4, 'Enter a valid API key').max(128),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  pullFrequency: z.enum(['manual', 'daily', 'hourly']).default('daily'),
});

export const metaConfigSchema = z.object({
  pageId: z.string().optional(),
  pageName: z.string().optional(),
  pageAccessToken: z.string().min(10, 'Enter a valid page access token').optional(),
  fieldMapping: z.record(z.string()).default({}),
});

export const createLeadSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JUSTDIAL'),
    label: z.string().min(1).max(100),
    config: justDialConfigSchema,
  }),
  z.object({
    type: z.literal('INDIAMART'),
    label: z.string().min(1).max(100),
    config: indiamartConfigSchema,
  }),
  z.object({
    type: z.literal('META'),
    label: z.string().min(1).max(100),
    config: metaConfigSchema,
  }),
]);

export const updateLeadSourceSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});
