import { Suspense, use } from 'react';
import { LeadDetailView } from '@/components/leads/lead-detail-view';

export const metadata = { title: 'Lead Detail — Excess CRM' };

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="h-96 bg-white rounded-xl animate-pulse" />}>
      <LeadDetailView id={id} />
    </Suspense>
  );
}
