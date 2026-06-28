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

export interface ConversationIntel {
  analyzedCalls: number;
  sentiment: { POSITIVE: number; NEUTRAL: number; NEGATIVE: number };
  topObjections: { tag: string; count: number }[];
}

export function useConversationIntel() {
  return useQuery({
    queryKey: ['insights', 'conversations'],
    queryFn: () =>
      api.get<{ data: ConversationIntel }>('/reports/conversations').then((r) => r.data.data),
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

// ── Lead Score ────────────────────────────────────────────────────────────────

export interface LeadScoreBreakdown {
  factors: { name: string; contribution: number; evidence: string }[];
  total: number;
  version: number;
}

export interface LeadScore {
  score: number;
  label: 'Cold' | 'Warm' | 'Hot' | 'Burning';
  color: 'slate' | 'amber' | 'orange' | 'red';
  breakdown: LeadScoreBreakdown;
}

export function useComputeLeadScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) =>
      api.get<{ data: LeadScore }>(`/leads/${leadId}/score`).then((r) => r.data.data),
    onSuccess: (_data, leadId) => {
      // Invalidate the lead so its aiScore refreshes in the detail view
      void qc.invalidateQueries({ queryKey: ['leads', leadId] });
    },
  });
}

// ── Call Insights ─────────────────────────────────────────────────────────────

export interface CallInsights {
  callId: string;
  durationSec: number | null;
  summary: string | null;
  interestLevel: 'High' | 'Medium' | 'Low' | 'Unknown';
  painPoints: string[];
  objections: string[];
  nextAction: string;
  sentiment: string;
  transcriptLength: number;
}

export function useCallInsights(callId: string | null) {
  return useQuery({
    queryKey: ['calls', callId, 'insights'],
    queryFn: () =>
      api.get<{ data: CallInsights }>(`/calls/${callId}/insights`).then((r) => r.data.data),
    enabled: !!callId,
  });
}

export interface CallQa {
  overall: number;
  grade: string;
  dimensions: Record<string, number>;
  compliance: boolean;
  strengths: string[];
  improvements: string[];
}

export function useCallQa(callId: string | null) {
  return useQuery({
    queryKey: ['calls', callId, 'qa'],
    queryFn: () =>
      api.get<{ data: { qa: CallQa | null } }>(`/calls/${callId}/qa`).then((r) => r.data.data.qa),
    enabled: !!callId,
    staleTime: 60 * 60 * 1000, // scored once + cached server-side
  });
}

export interface NextAction {
  action: string;
  reason: string;
  generatedAt: string;
}

export interface DailyBrief {
  brief: string;
  stats: { hot: number; overdue: number; qualified: number; followUp: number; newToday: number };
  hotLeads: { id: string; name: string; stage: string; aiScore: number | null; city: string | null }[];
  generatedAt: string;
}

// AI-phrased "your day" briefing for the dashboard. Always returns something useful.
export function useDailyBrief() {
  return useQuery({
    queryKey: ['ai', 'daily-brief'],
    queryFn: () =>
      api.get<{ data: DailyBrief }>('/ai/daily-brief').then((r) => r.data.data).catch(() => null),
    staleTime: 30 * 60 * 1000,
  });
}

// AI "what to do next" for a lead. Cached server-side (4h); errors/no-key resolve to
// undefined so the UI can hide cleanly.
export function useNextAction(leadId: string) {
  return useQuery({
    queryKey: ['leads', leadId, 'next-action'],
    queryFn: () =>
      api
        .get<{ data: NextAction }>(`/leads/${leadId}/next-action`)
        .then((r) => r.data.data)
        .catch(() => null),
    enabled: !!leadId,
    staleTime: 4 * 3600 * 1000,
  });
}
