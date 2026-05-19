import type { Metadata } from 'next';
import { StageGatesSettings } from '@/components/settings/stage-gates-settings';

export const metadata: Metadata = { title: 'Stage Gates — Settings — Excess CRM' };

export default function StageGatesPage() {
  return <StageGatesSettings />;
}
