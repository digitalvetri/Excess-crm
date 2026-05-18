'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

export interface Referral {
  id: string;
  referrerId: string;
  referredLeadId: string;
  status: 'PENDING' | 'CONVERTED' | 'REWARDED';
  rewardInr?: string;
  rewardedAt?: string;
  createdAt: string;
  referredLead?: { name: string; phone: string; stage: string };
}

export function useReferrals(filters?: { status?: string }) {
  const [data, setData] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const status = filters?.status;

  const fetch = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: Referral[] }>('/referrals', { params: status ? { status } : {} })
      .then((r) => {
        if (!cancelled) {
          setData(r.data.data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load referrals');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    const cancel = fetch();
    return cancel;
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useCreateReferral() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (referrerId: string, referredLeadId: string): Promise<Referral> => {
      setLoading(true);
      setError(null);
      try {
        const r = await api.post<{ data: Referral }>('/referrals', {
          referrerId,
          referredLeadId,
        });
        return r.data.data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create referral';
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { create, loading, error };
}

export function useRewardReferral() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reward = useCallback(async (id: string, rewardInr: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/referrals/${id}/reward`, { rewardInr });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reward referral';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { reward, loading, error };
}
