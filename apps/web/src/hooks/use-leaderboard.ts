'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface AgentStat {
  userId: string;
  name: string;
  convertedLeads: number;
}

export interface FranchiseStat {
  tenantId: string;
  name: string;
  commissionInr: string;
}

export interface LeaderboardData {
  monthStart: string;
  agents: AgentStat[];
  franchises: FranchiseStat[];
}

export function useLeaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: LeaderboardData }>('/leaderboard')
      .then((r) => {
        if (!cancelled) {
          setData(r.data.data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
