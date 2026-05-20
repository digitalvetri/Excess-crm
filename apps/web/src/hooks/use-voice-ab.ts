'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const AB_PERSONAS = ['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP'] as const;
export type AbPersona = (typeof AB_PERSONAS)[number];

export const PERSONA_LABEL: Record<AbPersona, string> = {
  RESHMA_VERIFY: 'Reshma — Verification',
  KARTHIK_SALES: 'Karthik — Sales',
  RESHMA_FOLLOWUP: 'Reshma — Follow-up',
};

export interface AbResultRow {
  persona: string;
  variant: string;
  calls: number;
  connectRate: number;
  avgDurationSec: number;
}

export function useAbConfig() {
  return useQuery({
    queryKey: ['voice-ab', 'config'],
    queryFn: () =>
      api
        .get<{ data: { abTestConfig?: Record<string, number> } | null }>('/voice-agent/settings')
        .then((r) => r.data.data?.abTestConfig ?? {}),
  });
}

export function useAbResults() {
  return useQuery({
    queryKey: ['voice-ab', 'results'],
    queryFn: () => api.get<{ data: AbResultRow[] }>('/voice-agent/ab-results').then((r) => r.data.data),
  });
}

export function useUpdateAbConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (abTestConfig: Record<string, number>) =>
      api.put('/voice-agent/ab-config', { abTestConfig }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['voice-ab'] }),
  });
}
