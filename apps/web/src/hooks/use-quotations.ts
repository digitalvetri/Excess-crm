'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

export interface Quotation {
  id: string;
  leadId: string;
  number: string;
  systemKw: string;
  brandTier: 'ECONOMY' | 'MID' | 'PREMIUM';
  totalInr: string;
  subsidyInr: string;
  netPayable: string;
  emiMonthly?: string;
  paybackYears?: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
  sentAt?: string;
  sentVia?: string;
  createdAt: string;
  lead?: { name: string; phone: string };
}

export interface CreateQuotationInput {
  leadId: string;
  systemKw: number;
  brandTier: 'ECONOMY' | 'MID' | 'PREMIUM';
  totalInr: number;
  subsidyInr: number;
  netPayable: number;
  emiMonthly?: number;
  paybackYears?: number;
  lineItems?: unknown[];
}

export function useQuotations(filters?: { leadId?: string; status?: string }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: { quotations: Quotation[]; nextCursor: string | null; hasMore: boolean } }>('/quotations', { params: filters ?? {} })
      .then((r) => {
        if (!cancelled) {
          setQuotations(r.data.data.quotations);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load quotations';
          setError(message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.leadId, filters?.status]);

  return { quotations, loading, error };
}

export function useCreateQuotation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateQuotationInput): Promise<Quotation> => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<{ data: Quotation }>('/quotations', input);
      return r.data.data;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create quotation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}

export function useSendQuotation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (id: string, via: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/quotations/${id}/send`, { via });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send quotation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { send, loading, error };
}
