'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface FunnelData {
  monthStart: string;
  stages: { stage: string; count: number }[];
}

export interface DailyTrend {
  day: string;
  count: number;
}

export interface SourceBreakdown {
  sources: { sourceType: string; count: number }[];
}

export interface AgentPerformance {
  agents: { userId: string; name: string; converted: number; total: number }[];
}

export interface RevenuePipeline {
  qualifiedPipeline: number;
  convertedRevenue: string;
  quotationsThisMonth: number;
}

export interface CallAnalytics {
  totalCalls: number;
  connectRate: number;
  avgDurationSec: number;
  byStatus: { status: string; count: number }[];
  byPersona: { persona: string; total: number; connected: number; connectRate: number; avgDurationSec: number }[];
  daily: { day: string; count: number }[];
  byHour: { hour: number; count: number }[];
}

interface ReportState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useFunnel(): ReportState<FunnelData> {
  const [state, setState] = useState<ReportState<FunnelData>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    api
      .get<{ data: FunnelData }>('/reports/funnel')
      .then((res) => {
        if (!cancelled) {
          setState({ data: res.data.data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load funnel data';
          setState({ data: null, loading: false, error: message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function useDailyTrend(): ReportState<DailyTrend[]> {
  const [state, setState] = useState<ReportState<DailyTrend[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    api
      .get<{ data: DailyTrend[] }>('/reports/daily')
      .then((res) => {
        if (!cancelled) {
          setState({ data: res.data.data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load daily trend data';
          setState({ data: null, loading: false, error: message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function useSourceBreakdown(): ReportState<SourceBreakdown> {
  const [state, setState] = useState<ReportState<SourceBreakdown>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    api
      .get<{ data: SourceBreakdown }>('/reports/sources')
      .then((res) => {
        if (!cancelled) {
          setState({ data: res.data.data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load source breakdown data';
          setState({ data: null, loading: false, error: message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function useAgentPerformance(): ReportState<AgentPerformance> {
  const [state, setState] = useState<ReportState<AgentPerformance>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    api
      .get<{ data: AgentPerformance }>('/reports/agents')
      .then((res) => {
        if (!cancelled) {
          setState({ data: res.data.data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load agent performance data';
          setState({ data: null, loading: false, error: message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function useCallAnalytics(): ReportState<CallAnalytics> {
  const [state, setState] = useState<ReportState<CallAnalytics>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get<{ data: CallAnalytics }>('/reports/calls')
      .then((res) => {
        if (!cancelled) setState({ data: res.data.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load call analytics';
          setState({ data: null, loading: false, error: message });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

export function useRevenuePipeline(): ReportState<RevenuePipeline> {
  const [state, setState] = useState<ReportState<RevenuePipeline>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    api
      .get<{ data: RevenuePipeline }>('/reports/revenue-pipeline')
      .then((res) => {
        if (!cancelled) {
          setState({ data: res.data.data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load revenue pipeline data';
          setState({ data: null, loading: false, error: message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
