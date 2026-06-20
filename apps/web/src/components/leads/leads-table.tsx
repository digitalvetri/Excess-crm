'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Phone, Mail, MapPin, ChevronRight, MoreVertical, X, Loader2, Inbox, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useLeads } from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-teams';
import { useBulkAction } from '@/hooks/use-leads';
import { scoreTier, scoreColorClasses } from '@/lib/lead-score';
import { StageBadge } from './stage-badge';
import { StaleBadge } from './stale-badge';
import { StageChangeMenu } from './stage-change-menu';

const SOURCE_LABELS: Record<string, string> = {
  META: 'Meta',
  INDIAMART: 'IndiaMART',
  JUSTDIAL: 'JustDial',
  WEBSITE: 'Website',
  WHATSAPP: 'WhatsApp',
  PHONE_INBOUND: 'Phone',
  MANUAL: 'Manual',
};

const STAGES = [
  { value: 'NEW', label: 'New' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'NOT_ANSWERED', label: 'Not Answered' },
  { value: 'INVALID', label: 'Invalid' },
  { value: 'WRONG_ENQUIRY', label: 'Wrong Enquiry' },
];

const SCORE_LABELS: Record<string, string> = {
  location: 'Location match',
  budget: 'Budget signal',
  engagement: 'Engagement speed',
  source: 'Source quality',
  recency: 'Lead recency',
  completeness: 'Profile completeness',
};

function AiScoreBadge({ score, breakdown }: { score: number; breakdown: Record<string, unknown> | null }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const visible = hovered || pinned;
  const factors = breakdown ? Object.entries(breakdown) : [];
  const tier = scoreTier(score);
  const c = scoreColorClasses[tier.color];

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-label={`AI score ${score} (${tier.label}). Tap to view breakdown`}
        aria-expanded={visible}
        onClick={(e) => {
          // The badge lives inside a Link — stop the row from navigating on tap.
          e.preventDefault();
          e.stopPropagation();
          setPinned((p) => !p);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => { setHovered(false); setPinned(false); }}
        className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full cursor-pointer ${c.bg} ${c.text}`}
      >
        AI {score}
        <Info size={8} className="opacity-60" />
      </button>
      {visible && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-48 max-w-[calc(100vw-2rem)] bg-white border border-border rounded-xl shadow-xl p-3 text-left">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">{tier.label} · Score breakdown</p>
          {factors.length === 0 ? (
            <p className="text-xs text-slate-400">AI confidence score based on lead quality, source, location match, and engagement speed.</p>
          ) : (
            <div className="space-y-1.5">
              {factors.map(([key, val]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600 truncate">{SCORE_LABELS[key] ?? key}</span>
                  <span className="text-[11px] font-semibold text-slate-800 shrink-0">{String(val)}</span>
                </div>
              ))}
              <div className="pt-1 border-t border-border flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Total</span>
                <span className={`text-[11px] font-bold ${c.text}`}>{score}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// ─── Bulk-assign modal ────────────────────────────────────────────────────────

function BulkAssignModal({
  count,
  ids,
  onClose,
  onDone,
}: {
  count: number;
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: users, isLoading } = useUsers();
  const bulk = useBulkAction();
  const [selected, setSelected] = useState('');

  async function apply() {
    if (!selected) return;
    await bulk.mutateAsync({ action: 'assign', ids, value: selected });
    toast.success(`${count} lead${count !== 1 ? 's' : ''} assigned`);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-slate-800">Assign {count} lead{count !== 1 ? 's' : ''}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
          ) : (
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">Select a team member...</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.role.replace('_', ' ')})</option>
              ))}
            </select>
          )}
          <div className="flex gap-3">
            <button
              onClick={apply}
              disabled={!selected || bulk.isPending}
              className="flex-1 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {bulk.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Assign
            </button>
            <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk-stage modal ────────────────────────────────────────────────────────

function BulkStageModal({
  count,
  ids,
  onClose,
  onDone,
}: {
  count: number;
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const bulk = useBulkAction();
  const [selected, setSelected] = useState('');

  async function apply() {
    if (!selected) return;
    await bulk.mutateAsync({ action: 'stage', ids, value: selected });
    toast.success(`${count} lead${count !== 1 ? 's' : ''} moved to ${selected.replace('_', ' ')}`);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-slate-800">Change stage for {count} lead{count !== 1 ? 's' : ''}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">Select new stage...</option>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="flex gap-3">
            <button
              onClick={apply}
              disabled={!selected || bulk.isPending}
              className="flex-1 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {bulk.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Update Stage
            </button>
            <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk-tag modal ───────────────────────────────────────────────────────────

function BulkTagModal({
  count, ids, onClose, onDone,
}: { count: number; ids: string[]; onClose: () => void; onDone: () => void }) {
  const bulk = useBulkAction();
  const [input, setInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const PRESET = ['Hot', 'Warm', 'Cold', 'High Value', 'Follow Up Soon', 'DND'];

  function addTag(t: string) {
    const trimmed = t.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setInput('');
  }

  async function apply() {
    if (tags.length === 0) return;
    await bulk.mutateAsync({ action: 'tag', ids, value: tags.join(',') });
    toast.success(`Tags added to ${count} lead${count !== 1 ? 's' : ''}`);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-slate-800">Tag {count} lead{count !== 1 ? 's' : ''}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESET.map((t) => (
              <button key={t} onClick={() => addTag(t)} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full hover:bg-primary/10 hover:text-primary transition-colors">
                + {t}
              </button>
            ))}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {t}
                  <button onClick={() => setTags((p) => p.filter((x) => x !== t))}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTag(input); }}
              placeholder="Custom tag..."
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button onClick={() => addTag(input)} className="text-sm bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200">Add</button>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => void apply()}
              disabled={tags.length === 0 || bulk.isPending}
              className="flex-1 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {bulk.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Apply Tags
            </button>
            <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm text-slate-600">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Leads table ─────────────────────────────────────────────────────────────

export function LeadsTable() {
  const { leads: leadsData, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useLeads();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stageMenuOpen, setStageMenuOpen] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState(false);
  const [stageModal, setStageModal] = useState(false);
  const [tagModal, setTagModal] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-border animate-pulse">
            <div className="w-4 h-4 bg-slate-200 rounded mt-1" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-48" />
              <div className="h-3 bg-slate-100 rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-danger">Failed to load leads. Please refresh.</p>
      </div>
    );
  }

  const leads = leadsData;

  if (leads.length === 0) {
    const hasActiveFilters = ['search', 'stage', 'sourceType'].some((k) => (searchParams.get(k) ?? '') !== '');
    return (
      <div className="bg-white rounded-xl border border-border p-12 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Inbox size={26} className="text-primary" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">No leads found</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-xs">
          {hasActiveFilters
            ? 'No leads match your current filters. Try clearing them to see everything.'
            : 'New leads will appear here as they arrive. You can also add one manually.'}
        </p>
        {hasActiveFilters && (
          <Link
            href="/leads"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-primary px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <X size={14} /> Clear filters
          </Link>
        )}
      </div>
    );
  }

  function toggleAll() {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
    setAssignModal(false);
    setStageModal(false);
    setTagModal(false);
  }

  const selectedIds = Array.from(selected);

  return (
    <>
      {assignModal && (
        <BulkAssignModal
          count={selected.size}
          ids={selectedIds}
          onClose={() => setAssignModal(false)}
          onDone={clearSelection}
        />
      )}
      {stageModal && (
        <BulkStageModal
          count={selected.size}
          ids={selectedIds}
          onClose={() => setStageModal(false)}
          onDone={clearSelection}
        />
      )}
      {tagModal && (
        <BulkTagModal
          count={selected.size}
          ids={selectedIds}
          onClose={() => setTagModal(false)}
          onDone={clearSelection}
        />
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-4 px-4 py-2.5 bg-primary/5 border-b border-primary/10">
            <span className="text-sm font-semibold text-primary">{selected.size} selected</span>
            <button
              onClick={() => setAssignModal(true)}
              className="text-sm text-slate-700 hover:text-primary font-medium px-2 py-1 rounded hover:bg-primary/5 transition-colors"
            >
              Assign
            </button>
            <button
              onClick={() => setStageModal(true)}
              className="text-sm text-slate-700 hover:text-primary font-medium px-2 py-1 rounded hover:bg-primary/5 transition-colors"
            >
              Change stage
            </button>
            <button
              onClick={() => setTagModal(true)}
              className="text-sm text-slate-700 hover:text-primary font-medium px-2 py-1 rounded hover:bg-primary/5 transition-colors"
            >
              Tag
            </button>
            <button
              onClick={clearSelection}
              className="text-sm text-slate-500 hover:text-slate-700 ml-auto flex items-center gap-1"
            >
              <X size={14} /> Clear
            </button>
          </div>
        )}

        {/* Header */}
        <div className="hidden md:flex items-center gap-4 px-4 py-2.5 border-b border-border bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <input
            type="checkbox"
            checked={selected.size === leads.length && leads.length > 0}
            onChange={toggleAll}
            aria-label="Select all leads"
            className="rounded accent-primary"
          />
          <span className="flex-1">Lead</span>
          <span className="w-28">Stage</span>
          <span className="w-24">Source</span>
          <span className="w-32">Received</span>
          <span className="w-8" />
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {leads.map((lead) => (
            <div
              key={lead.id}
              className={`flex items-start md:items-center gap-4 px-4 py-3 hover:bg-slate-50/70 transition-colors group ${
                selected.has(lead.id) ? 'bg-primary/3' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(lead.id)}
                onChange={() => toggle(lead.id)}
                aria-label={`Select ${lead.name}`}
                className="rounded mt-1 md:mt-0 accent-primary"
                onClick={(e) => e.stopPropagation()}
              />

              <Link href={`/leads/${lead.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-slate-800 text-sm">{lead.name}</p>
                  {/* Stage is a dedicated column on desktop; surface it inline on mobile */}
                  <span className="md:hidden">
                    <StageBadge stage={lead.stage} />
                  </span>
                  <StaleBadge stageChangedAt={lead.stageChangedAt} />
                  {lead.aiScore !== null && (
                    <AiScoreBadge score={lead.aiScore} breakdown={lead.aiScoreBreakdown ?? null} />
                  )}
                  {lead.isDuplicate && (
                    <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-100">
                      Duplicate
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Phone size={11} /> {lead.phone}
                  </span>
                  {lead.email && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Mail size={11} /> {lead.email}
                    </span>
                  )}
                  {lead.city && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin size={11} /> {lead.city}
                    </span>
                  )}
                  {/* Source is a dedicated column on desktop; surface it inline on mobile */}
                  <span className="md:hidden text-xs text-slate-400">
                    {SOURCE_LABELS[lead.sourceType] ?? lead.sourceType}
                  </span>
                </div>
                {lead.tags && lead.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {lead.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[10px] bg-primary/8 text-primary px-1.5 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                    {lead.tags.length > 3 && (
                      <span className="text-[10px] text-slate-400">+{lead.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </Link>

              <div className="w-28 hidden md:block">
                <StageBadge stage={lead.stage} />
              </div>

              <div className="w-24 hidden md:block">
                <span className="text-xs text-slate-500">{SOURCE_LABELS[lead.sourceType] ?? lead.sourceType}</span>
              </div>

              <div className="w-32 hidden md:block">
                <span className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                </span>
              </div>

              <div className="relative">
                <button
                  onClick={() => setStageMenuOpen(stageMenuOpen === lead.id ? null : lead.id)}
                  aria-label="Lead actions"
                  title="Change stage"
                  className="p-1 rounded hover:bg-slate-100 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical size={16} className="text-slate-400" />
                </button>
                {stageMenuOpen === lead.id && (
                  <StageChangeMenu
                    leadId={lead.id}
                    currentStage={lead.stage}
                    onClose={() => setStageMenuOpen(null)}
                  />
                )}
              </div>

              <Link
                href={`/leads/${lead.id}`}
                className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight size={16} className="text-slate-400" />
              </Link>
            </div>
          ))}
        </div>

        {/* Load more */}
        {hasNextPage && (
          <div className="px-4 py-3 border-t border-border text-center">
            <button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
