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

// Create a KB article. Auto-derives a unique slug (titles may be Tamil/non-ASCII) and
// publishes immediately so the article is live AND searchable by the voice agent's RAG
// (which only returns rows where published_at IS NOT NULL).
export async function createKbArticle(input: {
  title: string;
  body: string;
  category: string;
  language?: string;
}): Promise<KbArticle> {
  const base = input.title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50);
  const slug = `${base || 'kb'}-${Date.now().toString(36)}`;
  const res = await api.post<{ data: KbArticle }>('/kb', {
    slug,
    title: input.title.trim(),
    body: input.body.trim(),
    category: input.category.trim() || 'general',
    ...(input.language ? { language: input.language } : {}),
    publishedAt: new Date().toISOString(),
  });
  return res.data.data;
}

export function useKbArticles(filters?: { q?: string; category?: string }) {
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

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
  }, [JSON.stringify(filters), reloadCount]);

  return { articles, loading, error, reload: () => setReloadCount((c) => c + 1) };
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
