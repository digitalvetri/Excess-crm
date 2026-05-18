'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

export interface CallRecord {
  id: string;
  leadId: string;
  persona: string;
  direction: string;
  status: string;
  durationSec: number | null;
  initiatedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  lead: { name: string; phone: string; stage: string };
}

interface CallsResponse {
  data: CallRecord[];
}

export function useCalls() {
  const searchParams = useSearchParams();
  const params = Object.fromEntries(searchParams.entries());

  return useQuery({
    queryKey: ['calls', params],
    queryFn: () =>
      api.get<CallsResponse>('/voice-agent/calls', { params }).then((r) => r.data.data),
  });
}

export function useVoiceAgentSettings() {
  return useQuery({
    queryKey: ['voice-agent-settings'],
    queryFn: () =>
      api.get<{ data: Record<string, unknown> }>('/voice-agent/settings').then((r) => r.data.data),
  });
}
