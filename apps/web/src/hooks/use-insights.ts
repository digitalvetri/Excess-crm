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

export interface ForecastStage {
  stage: string;
  probability: number;
  leadCount: number;
  rawValue: number;
  weightedValue: number;
}

export interface ForecastData {
  stages: ForecastStage[];
  totalWeighted: number;
  totalRaw: number;
  committedRevenue: number;
}

export function useForecast() {
  return useQuery({
    queryKey: ['insights', 'forecast'],
    queryFn: () => api.get<{ data: ForecastData }>('/reports/forecast').then((r) => r.data.data),
  });
}
