import type { Metadata } from 'next';
import { SequencesSettings } from '@/components/settings/sequences-settings';

export const metadata: Metadata = { title: 'Drip Sequences — Settings — Excess CRM' };

export default function SequencesPage() {
  return <SequencesSettings />;
}
