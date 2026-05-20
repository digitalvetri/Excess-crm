'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export type ReportDimension = 'stage' | 'source' | 'team' | 'owner' | 'city' | 'month';
export type ReportMetric = 'count' | 'conversionRate' | 'avgAiScore';

export interface ReportDefinition {
  dimension: ReportDimension;
  metric: ReportMetric;
  dateFrom?: string;
  dateTo?: string;
}

export interface ReportResult {
  dimension: string;
  metric: string;
  rows: { label: string; value: number }[];
}

export interface SavedReport {
  id: string;
  name: string;
  definition: ReportDefinition;
  createdAt: string;
}

export function useSavedReports() {
  return useQuery({
    queryKey: ['insights', 'saved-reports'],
    queryFn: () => api.get<{ data: SavedReport[] }>('/report-builder/saved').then((r) => r.data.data),
  });
}

export function useRunReport() {
  return useMutation({
    mutationFn: (def: ReportDefinition) =>
      api.post<{ data: ReportResult }>('/report-builder/run', def).then((r) => r.data.data),
  });
}

export function useSaveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; definition: ReportDefinition }) =>
      api.post('/report-builder/saved', input).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['insights', 'saved-reports'] }),
  });
}

export function useDeleteSavedReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/report-builder/saved/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['insights', 'saved-reports'] }),
  });
}
