import type { Metadata } from 'next';
import { CsvImportView } from '@/components/leads/csv-import-view';

export const metadata: Metadata = { title: 'Import Leads — Excess CRM' };

export default function CsvImportPage() {
  return <CsvImportView />;
}
