import { z } from 'zod';

export const leadStageSchema = z.enum([
  'NEW',
  'QUALIFIED',
  'FOLLOW_UP',
  'CONVERTED',
  'NOT_ANSWERED',
  'INVALID',
  'WRONG_ENQUIRY',
]);

export const leadSourceTypeSchema = z.enum([
  'META',
  'INDIAMART',
  'JUSTDIAL',
  'WEBSITE',
  'WHATSAPP',
  'MANUAL',
  'PHONE_INBOUND',
]);

export const factSheetSchema = z.object({
  roofType: z.enum(['concrete', 'sheet', 'tiled', 'mixed', 'unknown']).optional(),
  monthlyBill: z.string().optional(),
  budgetRange: z.string().optional(),
  urgency: z.enum(['this_week', 'this_month', 'this_quarter', 'exploring']).optional(),
  decisionMaker: z
    .enum(['self', 'spouse', 'parent', 'business_partner', 'unknown'])
    .optional(),
  painPoint: z
    .enum(['high_bill', 'power_cuts', 'backup', 'roi', 'subsidy', 'environment', 'other'])
    .optional(),
});

export const updateLeadSchema = z.object({
  stage: leadStageSchema.optional(),
  factSheet: factSheetSchema.optional(),
  notes: z.string().max(5000).optional(),
  language: z.enum(['ta', 'en', 'ta-en']).optional(),
  dealValueInr: z.number().positive().optional(),
});

export const assignLeadSchema = z.object({
  userId: z.string().uuid(),
});

export const addNoteSchema = z.object({
  text: z.string().min(1).max(5000),
});

export const leadFiltersSchema = z.object({
  stage: z.string().optional(),
  source: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  city: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sort: z.enum(['createdAt', 'stageChangedAt', 'aiScore', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(25),
});

export const bulkLeadActionSchema = z.object({
  action: z.enum(['stage', 'assign']),
  ids: z.array(z.string().uuid()).min(1).max(500),
  value: z.string(),
});

export const updateLeadTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(50)).max(20),
});

export const mergeLeadSchema = z.object({
  duplicateId: z.string().uuid(),
});

export const createSavedViewSchema = z.object({
  name: z.string().min(1).max(100),
  filters: z.record(z.string()).default({}),
  icon: z.string().max(10).optional(),
  isShared: z.boolean().default(false),
});
