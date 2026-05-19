import type { Metadata } from 'next';
import { AssignmentRulesSettings } from '@/components/settings/assignment-rules-settings';

export const metadata: Metadata = { title: 'Assignment Rules — Settings — Excess CRM' };

export default function AssignmentRulesPage() {
  return <AssignmentRulesSettings />;
}
