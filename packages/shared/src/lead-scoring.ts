// Single source of truth for lead quality scoring (v2). Used by BOTH the daily
// worker batch (apps/worker) and the on-demand API refresh (apps/api) so the
// persisted aiScore / aiScoreBreakdown is always computed the same way.

export const SCORE_VERSION = 2;

export interface ScoreFactor {
  name: string;
  contribution: number;
  evidence: string;
}

export interface ScorableLead {
  id: string;
  stage: string;
  email: string | null;
  city: string | null;
  pincode: string | null;
  sourceType: string;
  receivedAt: Date;
}

export interface LeadScoreBreakdown {
  factors: ScoreFactor[];
  total: number;
  version: number;
}

const STAGE_POINTS: Record<string, number> = {
  NEW: 5,
  QUALIFIED: 25,
  FOLLOW_UP: 20,
  CONVERTED: 30,
  NOT_ANSWERED: 3,
  INVALID: 0,
  WRONG_ENQUIRY: 0,
};

const SOURCE_POINTS: Record<string, number> = {
  WEBSITE: 12,
  INDIAMART: 12,
  JUSTDIAL: 10,
  PHONE_INBOUND: 12,
  META: 9,
  WHATSAPP: 9,
  MANUAL: 7,
};

/**
 * Transparent rule-based lead score (v2). Every factor's contribution and
 * evidence is recorded so the UI can show exactly why a lead scored what it did.
 */
export function scoreLead(
  lead: ScorableLead,
  activityTypes: Set<string>,
): { score: number; breakdown: LeadScoreBreakdown } {
  const factors: ScoreFactor[] = [];

  factors.push({
    name: 'Stage',
    contribution: STAGE_POINTS[lead.stage] ?? 0,
    evidence: lead.stage.replace(/_/g, ' '),
  });

  let contact = 0;
  const haveContact: string[] = [];
  if (lead.email) { contact += 5; haveContact.push('email'); }
  if (lead.city) { contact += 5; haveContact.push('city'); }
  if (lead.pincode) { contact += 5; haveContact.push('pincode'); }
  factors.push({
    name: 'Contact details',
    contribution: contact,
    evidence: haveContact.length ? haveContact.join(', ') : 'none on file',
  });

  let engagement = 0;
  const engEvidence: string[] = [];
  if (activityTypes.has('CALL')) { engagement += 8; engEvidence.push('called'); }
  if (activityTypes.has('NOTE')) { engagement += 4; engEvidence.push('note'); }
  if (activityTypes.has('QUOTATION_SENT')) { engagement += 8; engEvidence.push('quotation'); }
  if (activityTypes.has('APPOINTMENT_BOOKED')) { engagement += 5; engEvidence.push('appointment'); }
  engagement = Math.min(engagement, 25);
  factors.push({
    name: 'Engagement',
    contribution: engagement,
    evidence: engEvidence.length ? engEvidence.join(', ') : 'no activity yet',
  });

  factors.push({
    name: 'Source',
    contribution: SOURCE_POINTS[lead.sourceType] ?? 8,
    evidence: lead.sourceType,
  });

  const ageDays = (Date.now() - lead.receivedAt.getTime()) / 86_400_000;
  let recency = 0;
  let recencyEvidence = 'over 1 month old';
  if (ageDays < 2) { recency = 15; recencyEvidence = 'under 2 days old'; }
  else if (ageDays < 7) { recency = 10; recencyEvidence = 'under 1 week old'; }
  else if (ageDays < 30) { recency = 5; recencyEvidence = 'under 1 month old'; }
  factors.push({ name: 'Recency', contribution: recency, evidence: recencyEvidence });

  const total = Math.min(100, factors.reduce((s, f) => s + f.contribution, 0));
  return { score: total, breakdown: { factors, total, version: SCORE_VERSION } };
}

/** Human label + UI color band for a 0–100 score. */
export function scoreLabel(score: number): {
  label: 'Cold' | 'Warm' | 'Hot' | 'Burning';
  color: 'slate' | 'amber' | 'orange' | 'red';
} {
  if (score >= 76) return { label: 'Burning', color: 'red' };
  if (score >= 51) return { label: 'Hot', color: 'orange' };
  if (score >= 31) return { label: 'Warm', color: 'amber' };
  return { label: 'Cold', color: 'slate' };
}
