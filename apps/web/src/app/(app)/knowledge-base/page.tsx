'use client';

import { useState, useEffect, useMemo } from 'react';
import { useKbArticles, useKbArticle } from '@/hooks/use-kb';

export default function KnowledgeBasePage() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(() => {
    const f: { q?: string; category?: string } = {};
    if (debouncedSearch) f.q = debouncedSearch;
    if (categoryFilter !== 'ALL') f.category = categoryFilter;
    return f;
  }, [debouncedSearch, categoryFilter]);

  const { articles, loading, error } = useKbArticles(filters);
  const { article: selectedArticle, loading: articleLoading } = useKbArticle(selectedSlug);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(articles.map((a) => a.category)));
    return cats.sort();
  }, [articles]);

  function handleRead(slug: string) {
    setSelectedSlug((prev) => (prev === slug ? null : slug));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Knowledge Base</h1>
        <p className="text-sm text-slate-500 mt-1">
          Browse articles, guides, and FAQs for the team
        </p>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search articles…"
          className="w-full max-w-md px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>

      {/* Category tabs */}
      {articles.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              categoryFilter === 'ALL'
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Article overlay */}
      {selectedSlug !== null && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-16 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4">
            {articleLoading ? (
              <p className="text-sm text-slate-500">Loading article…</p>
            ) : selectedArticle ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{selectedArticle.title}</h2>
                    <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {selectedArticle.category}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedSlug(null)}
                    className="text-slate-400 hover:text-slate-600 transition-colors text-2xl leading-none mt-0.5"
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>
                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                  {selectedArticle.body}
                </div>
              </>
            ) : (
              <p className="text-sm text-red-600">Article not found</p>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : articles.length === 0 ? (
        <p className="text-sm text-slate-500">No articles found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article) => (
            <div
              key={article.id}
              className="bg-white border border-border rounded-xl p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow"
            >
              <div className="space-y-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {article.category}
                </span>
                <h3 className="font-semibold text-slate-900 text-sm leading-snug">
                  {article.title}
                </h3>
              </div>
              <p className="text-sm text-slate-500 flex-1 leading-relaxed">
                {article.body.slice(0, 150)}
                {article.body.length > 150 ? '…' : ''}
              </p>
              <button
                onClick={() => handleRead(article.slug)}
                className="self-start px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {selectedSlug === article.slug ? 'Close' : 'Read'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
