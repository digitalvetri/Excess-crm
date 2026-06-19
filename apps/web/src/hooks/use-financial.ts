'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface CommissionProjection {
  pipeline: { qualified: number; followUp: number; new: number };
  expectedConversions: number;
  projectedRevenueInr: number;
  projectedCommissionInr: number;
  avgRatePercent: number;
  avgDealValueInr: number;
  confidence: string;
}

export interface TerritoryEntry {
  pincode: string;
  city: string | null;
  projectCount: number;
  totalValueInr: number;
  totalSystemKw: number;
  totalReceivedInr: number;
  collectionRate: number;
}

export interface TerritoryRevenue {
  territories: TerritoryEntry[];
  totalInstalled: number;
  totalValueInr: number;
}

export interface ProfitabilityProject {
  id: string;
  number: string;
  customerName: string;
  city: string | null;
  systemKw: number;
  totalValueInr: number;
  totalReceivedInr: number;
  outstandingInr: number;
  collectionPct: number;
  handedOverAt: string | null;
  revenuePerKw: number;
}

export interface ProfitabilitySummary {
  totalProjects: number;
  totalValueInr: number;
  totalReceivedInr: number;
  totalOutstandingInr: number;
  avgCollectionPct: number;
}

export interface Profitability {
  projects: ProfitabilityProject[];
  summary: ProfitabilitySummary;
}

interface ReportState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useCommissionProjections(): ReportState<CommissionProjection> {
  const [state, setState] = useState<ReportState<CommissionProjection>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get<{ data: CommissionProjection }>('/commissions/projections')
      .then((res) => {
        if (!cancelled) setState({ data: res.data.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load commission projections';
          setState({ data: null, loading: false, error: message });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

export function useTerritoryRevenue(): ReportState<TerritoryRevenue> {
  const [state, setState] = useState<ReportState<TerritoryRevenue>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get<{ data: TerritoryRevenue }>('/reports/territory-revenue')
      .then((res) => {
        if (!cancelled) setState({ data: res.data.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load territory revenue';
          setState({ data: null, loading: false, error: message });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

export function useProfitability(): ReportState<Profitability> {
  const [state, setState] = useState<ReportState<Profitability>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get<{ data: Profitability }>('/reports/profitability')
      .then((res) => {
        if (!cancelled) setState({ data: res.data.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load profitability data';
          setState({ data: null, loading: false, error: message });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
