'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { BookOpen, Plus, Upload, Loader2 } from 'lucide-react';
import { can } from '@excess/shared';
import { useKbArticles, useKbArticle, createKbArticle } from '@/hooks/use-kb';
import { useAuth } from '@/hooks/use-auth';

export default function KnowledgeBasePage() {
  const { role } = useAuth();
  const canWrite = role ? can(role, 'kb.write') : false;
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  const { articles, loading, error, reload } = useKbArticles(filters);
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Knowledge Base</h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse articles, guides, and FAQs — and the facts the AI voice agent answers from
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 whitespace-nowrap"
          >
            <Plus size={15} /> Add Article
          </button>
        )}
      </div>

      {showCreate && (
        <CreateArticleModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

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
        <div className="bg-white rounded-xl border border-border p-12 flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <BookOpen size={26} className="text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-1">
            {debouncedSearch ? 'No articles match your search' : 'Knowledge base is empty'}
          </h3>
          <p className="text-sm text-slate-500 max-w-xs">
            {debouncedSearch
              ? 'Try a different keyword or clear the search.'
              : 'Articles, guides and FAQs added by your team will appear here.'}
          </p>
        </div>
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

function CreateArticleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('en');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('File is too large (max ~1 MB of text).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBody(String(reader.result ?? ''));
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file);
  }

  async function handleSave() {
    if (title.trim().length < 2 || body.trim().length < 10) {
      setError('Add a title and at least a sentence of content.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createKbArticle({ title, body, category, language });
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save the article.';
      setError(msg);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-12 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add Knowledge Base article</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none" aria-label="Close">&times;</button>
        </div>
        <p className="text-xs text-slate-500">Type the content or upload a .txt file. Published articles are also what the AI voice agent looks up to answer customer questions.</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. PM Surya Ghar subsidy"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. subsidy / pricing / faq"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="en">English</option>
              <option value="ta">Tamil</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-slate-500">Content</label>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <Upload size={12} /> Upload .txt
            </button>
            <input ref={fileRef} type="file" accept=".txt,.md,text/plain" onChange={handleFile} className="hidden" />
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9}
            placeholder="The facts for this article — e.g. 'Residential rooftop solar gets up to ₹78,000 central subsidy under PM Surya Ghar, credited to the bank account.'"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <p className="text-[11px] text-slate-400 mt-1">{body.length} characters</p>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white disabled:opacity-50 hover:opacity-90">
            {saving && <Loader2 size={14} className="animate-spin" />} Publish article
          </button>
        </div>
      </div>
    </div>
  );
}
