import type { Metadata } from 'next';
import { SlaRulesSettings } from '@/components/settings/sla-rules-settings';

export const metadata: Metadata = { title: 'SLA Rules — Settings — Excess CRM' };

export default function SlaRulesPage() {
  return <SlaRulesSettings />;
}
