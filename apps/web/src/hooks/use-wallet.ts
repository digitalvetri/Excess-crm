'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

export interface WalletTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amountInr: string;
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  balanceInr: string;
  updatedAt: string;
  transactions?: WalletTransaction[];
}

export function useWallet() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: { wallet: Wallet } }>('/wallet')
      .then((r) => {
        if (!cancelled) {
          setWallet(r.data.data.wallet);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load wallet');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { wallet, loading, error, refetch };
}

export function useWalletTransactions() {
  const [data, setData] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: { transactions: WalletTransaction[]; hasMore: boolean; nextCursor: string | null } }>('/wallet/transactions')
      .then((r) => {
        if (!cancelled) {
          setData(r.data.data.transactions);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load transactions');
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

export function useCreateTransaction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (input: {
      type: 'CREDIT' | 'DEBIT';
      amountInr: string;
      description: string;
      referenceId?: string;
    }): Promise<WalletTransaction> => {
      setLoading(true);
      setError(null);
      try {
        const r = await api.post<{ data: WalletTransaction }>('/wallet/transactions', input);
        return r.data.data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create transaction';
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
