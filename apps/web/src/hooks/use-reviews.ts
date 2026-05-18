'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

export interface Review {
  id: string;
  leadId: string;
  rating: number;
  comment?: string;
  source: string;
  createdAt: string;
  lead?: { name: string };
}

export interface ReviewSummary {
  avgRating: string;
  totalCount: number;
  distribution: { rating: number; count: number }[];
}

export function useReviews(filters?: { leadId?: string }) {
  const [data, setData] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leadId = filters?.leadId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: Review[] }>('/reviews', { params: leadId ? { leadId } : {} })
      .then((r) => {
        if (!cancelled) {
          setData(r.data.data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load reviews');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  return { data, loading, error };
}

export function useReviewSummary() {
  const [data, setData] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: ReviewSummary }>('/reviews/summary')
      .then((r) => {
        if (!cancelled) {
          setData(r.data.data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load review summary');
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

export function useCreateReview() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (input: {
      leadId: string;
      rating: number;
      comment?: string;
      source?: string;
    }): Promise<Review> => {
      setLoading(true);
      setError(null);
      try {
        const r = await api.post<{ data: Review }>('/reviews', input);
        return r.data.data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create review';
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
