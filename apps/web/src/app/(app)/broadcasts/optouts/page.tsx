'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UserX, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api-error';
import { format } from 'date-fns';

interface OptedOutLead {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  stage: string;
  commsOptedOutAt: string;
}

function useOptedOutLeads() {
  return useQuery({
    queryKey: ['leads', 'opted-out'],
    queryFn: () =>
      api
        .get<{ data: { leads: OptedOutLead[]; hasMore: boolean } }>('/leads?commsOptedOut=true&limit=100')
        .then((r) => r.data.data),
  });
}

function useReoptIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => api.post(`/leads/${leadId}/reopt-in`).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['leads', 'opted-out'] }),
  });
}

export default function OptOutsPage() {
  const { data, isLoading, isError } = useOptedOutLeads();
  const reoptIn = useReoptIn();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const leads = data?.leads ?? [];

  async function handleReoptIn(id: string) {
    setPendingId(id);
    try {
      await reoptIn.mutateAsync(id);
      toast.success('Lead re-subscribed to communications');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to re-subscribe'));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/broadcasts"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary transition-colors"
        >
          <ArrowLeft size={14} /> Broadcasts
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Opt-out Management</h1>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        Leads listed here have replied STOP and opted out of all WhatsApp communications. Re-subscribing should only be done if the customer explicitly requests it.
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-danger text-sm">Failed to load opt-outs. Please refresh.</p>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <UserX size={26} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No opted-out leads. Great!</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">{leads.length} lead{leads.length !== 1 ? 's' : ''} opted out</p>
          <div className="overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-border">
                <tr>
                  {['Name', 'Phone', 'City', 'Stage', 'Opted out', 'Action'].map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <Link href={`/leads/${lead.id}`} className="hover:text-primary transition-colors">
                        {lead.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{lead.phone}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{lead.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        {lead.stage.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {format(new Date(lead.commsOptedOutAt), 'd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void handleReoptIn(lead.id)}
                        disabled={pendingId === lead.id}
                        className="inline-flex items-center gap-1 text-[11px] border border-border rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      >
                        {pendingId === lead.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <RotateCcw size={11} />}
                        Re-subscribe
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
