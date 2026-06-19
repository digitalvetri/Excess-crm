'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface UpsellCandidate {
  id: string;
  number: string;
  systemKw: number;
  totalValueInr: number;
  handedOverAt: string;
  avgMonthlyKwhGenerated: number;
  estimatedBatteryKwh: number;
  batteryRoiYears: number;
  lead: { id: string; name: string; phone: string; city: string | null };
  amcContracts: { id: string; endDate: string; valueInr: number | null }[];
}

export function useUpsellCandidates() {
  return useQuery({
    queryKey: ['projects', 'upsell-candidates'],
    queryFn: () =>
      api
        .get<{ data: { candidates: UpsellCandidate[]; total: number } }>('/projects/upsell-candidates')
        .then((r) => r.data.data),
  });
}

export function useStartUpsell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.post<{ data: { message: string } }>(`/projects/${projectId}/start-upsell`).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', 'upsell-candidates'] });
    },
  });
}
