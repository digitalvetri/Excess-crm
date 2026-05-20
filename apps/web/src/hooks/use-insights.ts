'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CohortRow {
  key: string;
  totalLeads: number;
  qualified: number;
  converted: number;
  conversionRate: number;
}

export interface CohortsData {
  monthly: CohortRow[];
  bySource: CohortRow[];
  byTeam: CohortRow[];
}

export function useCohorts() {
  return useQuery({
    queryKey: ['insights', 'cohorts'],
    queryFn: () => api.get<{ data: CohortsData }>('/reports/cohorts').then((r) => r.data.data),
  });
}
