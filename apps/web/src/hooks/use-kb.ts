'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface KbArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  language: string;
  publishedAt?: string;
  createdAt: string;
}

export function useKbArticles(filters?: { q?: string; category?: string }) {
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: { articles: KbArticle[]; hasMore: boolean; nextCursor: string | null } }>('/kb', { params: filters ?? {} })
      .then((r) => {
        if (!cancelled) {
          setArticles(r.data.data.articles);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load articles';
          setError(message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  return { articles, loading, error };
}

export function useKbArticle(slug: string | null) {
  const [article, setArticle] = useState<KbArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setArticle(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: KbArticle }>(`/kb/${slug}`)
      .then((r) => {
        if (!cancelled) {
          setArticle(r.data.data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load article';
          setError(message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { article, loading, error };
}
