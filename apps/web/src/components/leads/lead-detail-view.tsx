'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format, differenceInHours } from 'date-fns';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Edit2,
  Check,
  FileText,
  PhoneCall,
  MessageSquare,
  UserCheck,
  RefreshCw,
  CalendarCheck,
  AlertCircle,
  Star,
  X,
  Sparkles,
  Tag,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Copy,
  GitMerge,
  Link2,
  Send,
  Sun,
  Zap,
  TrendingUp,
  Leaf,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLeadDetail, useUpdateLead, useUpdateLeadTags, useLeadSummary, useMergeLeads, useSendLeadEmail } from '@/hooks/use-leads';
import { useQuery } from '@tanstack/react-query';
import { useComputeLeadScore, useCallInsights, useNextAction } from '@/hooks/use-insights';
import { api } from '@/lib/api';
import { useMessages, useSendMessage, useWhatsappStatus, useDraftReply } from '@/hooks/use-whatsapp';
import { scoreTier, scoreColorClasses } from '@/lib/lead-score';
import { StageBadge } from './stage-badge';
import { ConvertLeadModal } from './convert-lead-modal';
import { AppointmentsList } from '@/components/appointments/appointments-list';
import { AssignLeadPanel } from './assign-lead-panel';

const STAGES = [
  'NEW',
  'QUALIFIED',
  'FOLLOW_UP',
  'CONVERTED',
  'NOT_ANSWERED',
  'INVALID',
  'WRONG_ENQUIRY',
];

const SOURCE_LABELS: Record<string, string> = {
  META: 'Meta Lead Ads',
  INDIAMART: 'IndiaMART',
  JUSTDIAL: 'JustDial',
  WEBSITE: 'Website',
  WHATSAPP: 'WhatsApp',
  MANUAL: 'Manual',
  PHONE_INBOUND: 'Missed Call',
};

const ACTIVITY_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  NOTE: { icon: FileText, color: 'text-slate-500 bg-slate-100', label: 'Note' },
  STAGE_CHANGE: { icon: RefreshCw, color: 'text-primary bg-primary/10', label: 'Stage change' },
  ASSIGNMENT: { icon: UserCheck, color: 'text-indigo-600 bg-indigo-50', label: 'Assignment' },
  CALL: { icon: PhoneCall, color: 'text-green-600 bg-green-50', label: 'Call' },
  WHATSAPP: { icon: MessageSquare, color: 'text-emerald-600 bg-emerald-50', label: 'WhatsApp' },
  QUOTATION_SENT: { icon: FileText, color: 'text-amber-600 bg-amber-50', label: 'Quotation sent' },
  APPOINTMENT_BOOKED: { icon: CalendarCheck, color: 'text-blue-600 bg-blue-50', label: 'Appointment' },
  EMAIL: { icon: Mail, color: 'text-violet-600 bg-violet-50', label: 'Email' },
};

// AI "what to do next" for this lead. Hides cleanly when AI is off (no GROQ key).
function NextActionCard({ leadId }: { leadId: string }) {
  const { data, isLoading, refetch, isFetching } = useNextAction(leadId);
  if (!isLoading && !data) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Sparkles size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/70">Next best action</p>
        {isLoading ? (
          <div className="mt-1.5 h-4 w-44 rounded bg-primary/10 animate-pulse" />
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-800">{data!.action}</p>
            {data!.reason && <p className="mt-0.5 text-xs text-slate-600">{data!.reason}</p>}
          </>
        )}
      </div>
      <button
        onClick={() => void refetch()}
        disabled={isFetching}
        title="Refresh suggestion"
        className="rounded-lg p-1.5 text-slate-400 hover:bg-white/70 disabled:opacity-50"
      >
        <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}

function SlaBanner({ stage, stageChangedAt }: { stage: string; stageChangedAt: string }) {
  const hours = differenceInHours(new Date(), new Date(stageChangedAt));
  if (hours < 24 || stage === 'CONVERTED' || stage === 'INVALID' || stage === 'WRONG_ENQUIRY') return null;

  const urgent = hours > 72;
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
      urgent ? 'bg-red-50 text-danger border border-red-100' : 'bg-amber-50 text-warning border border-amber-100'
    }`}>
      <AlertCircle size={15} />
      <span className="font-medium">
        {urgent
          ? `No activity in ${Math.floor(hours / 24)} days — this lead needs attention`
          : `${hours}h in ${stage.replace('_', ' ')} stage`}
      </span>
    </div>
  );
}

interface ScoreFactorV2 {
  name: string;
  contribution: number;
  evidence: string;
}

function ScoreWithBreakdown({ score, breakdown }: { score: number | null; breakdown: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (score === null) return <span className="text-xs text-slate-400">—</span>;
  const c = scoreColorClasses[scoreTier(score).color];
  const color = `${c.bg} ${c.text} ${c.border}`;

  // v2 breakdown: { factors: [{name, contribution, evidence}], total, version }
  const rawFactors = breakdown ? (breakdown as { factors?: unknown }).factors : undefined;
  const v2Factors: ScoreFactorV2[] | null = Array.isArray(rawFactors)
    ? (rawFactors as ScoreFactorV2[])
    : null;
  const legacyFactors = breakdown && !v2Factors ? Object.entries(breakdown) : [];
  const hasDetail = (v2Factors?.length ?? 0) > 0 || legacyFactors.length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${color}`}
        title={hasDetail ? 'Click to see score breakdown' : undefined}
      >
        <Star size={11} /> {score} {hasDetail ? (open ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null}
      </button>
      {open && hasDetail && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-border rounded-xl shadow-lg p-3 w-64 text-xs space-y-1.5">
          <p className="font-semibold text-slate-700 mb-2">Score Breakdown</p>
          {v2Factors
            ? v2Factors.map((f) => (
                <div key={f.name} className="flex justify-between gap-3">
                  <span className="text-slate-500">
                    {f.name}
                    <span className="text-slate-400 ml-1">· {f.evidence}</span>
                  </span>
                  <span className="font-medium text-slate-700 shrink-0">+{f.contribution}</span>
                </div>
              ))
            : legacyFactors.map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="font-medium text-slate-700">{String(val)}</span>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

const PRESET_TAGS = ['Hot', 'Warm', 'Cold', 'High Value', 'Follow Up Soon', 'DND', 'Language Barrier'];

function LeadTagsCard({ leadId, tags }: { leadId: string; tags: string[] }) {
  const [editing, setEditing] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [input, setInput] = useState('');
  const { mutateAsync: updateTags, isPending } = useUpdateLeadTags();

  async function save() {
    try {
      await updateTags({ id: leadId, tags: localTags });
      setEditing(false);
      toast.success('Tags saved');
    } catch {
      toast.error('Failed to save tags');
    }
  }

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || localTags.includes(trimmed)) return;
    setLocalTags((prev) => [...prev, trimmed]);
    setInput('');
  }

  function removeTag(tag: string) {
    setLocalTags((prev) => prev.filter((t) => t !== tag));
  }

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Tag size={14} className="text-slate-400" /> Tags
        </h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={isPending}
              className="text-xs text-white bg-primary px-2 py-0.5 rounded-md disabled:opacity-50 flex items-center gap-1"
            >
              {isPending && <Loader2 size={10} className="animate-spin" />} Save
            </button>
            <button onClick={() => { setEditing(false); setLocalTags(tags); }} className="text-xs text-slate-500">
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {localTags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {tag}
            {editing && (
              <button onClick={() => removeTag(tag)} className="hover:text-danger"><X size={10} /></button>
            )}
          </span>
        ))}
        {localTags.length === 0 && !editing && (
          <span className="text-xs text-slate-400 italic">No tags</span>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_TAGS.filter((t) => !localTags.includes(t)).map((t) => (
              <button
                key={t}
                onClick={() => addTag(t)}
                className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-0.5"
              >
                <Plus size={9} /> {t}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { addTag(input); } }}
              placeholder="Custom tag..."
              className="flex-1 text-xs border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => addTag(input)}
              className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadSummaryCard({ leadId }: { leadId: string }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isError } = useLeadSummary(enabled ? leadId : null);

  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5">
          <Sparkles size={14} /> AI Summary
        </h3>
        {!enabled && (
          <button
            onClick={() => setEnabled(true)}
            className="text-xs bg-primary text-white px-3 py-1 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Generate
          </button>
        )}
      </div>

      {!enabled && (
        <p className="text-xs text-slate-500">Click Generate to get an AI-powered summary of this lead&apos;s intent and recommended next action.</p>
      )}

      {enabled && isLoading && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span className="text-xs text-primary/70">Analysing lead...</span>
        </div>
      )}

      {enabled && isError && (
        <p className="text-xs text-danger">Failed to generate summary. Please try again.</p>
      )}

      {enabled && data && (
        <div className="space-y-1">
          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{data.summary}</div>
          <p className="text-[10px] text-slate-400 mt-2">
            Generated {new Date(data.generatedAt).toLocaleTimeString()} · Cached 1h
          </p>
        </div>
      )}
    </div>
  );
}

interface DuplicateLead {
  id: string;
  name: string;
  phone: string;
  stage: string;
  createdAt: string;
}

function DuplicatesCard({ masterId }: { masterId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['leads', masterId, 'duplicates'],
    queryFn: () =>
      api.get<{ data: DuplicateLead[] }>(`/leads/${masterId}/duplicates`).then((r) => r.data.data),
  });
  const { mutateAsync: mergeLeads, isPending } = useMergeLeads();
  const [merging, setMerging] = useState<string | null>(null);

  const dupes = data ?? [];

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-border p-5 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-32 mb-3" />
      <div className="h-12 bg-slate-100 rounded" />
    </div>
  );

  if (dupes.length === 0) return null;

  async function handleMerge(duplicateId: string) {
    setMerging(duplicateId);
    try {
      await mergeLeads({ masterId, duplicateId });
      toast.success('Leads merged — duplicate marked as invalid');
    } catch {
      toast.error('Failed to merge leads');
    } finally {
      setMerging(null);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Copy size={15} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          {dupes.length} Duplicate{dupes.length !== 1 ? 's' : ''} Found
        </h3>
        <span className="text-xs text-amber-600 ml-auto">Same phone number</span>
      </div>
      <div className="space-y-2">
        {dupes.map((d) => (
          <div key={d.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-amber-100">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{d.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {d.stage.replace(/_/g, ' ')} · {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              <Link href={`/leads/${d.id}`} className="text-xs text-primary hover:underline">
                View
              </Link>
              <button
                onClick={() => void handleMerge(d.id)}
                disabled={isPending && merging === d.id}
                className="flex items-center gap-1 text-xs bg-amber-600 text-white px-2.5 py-1 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {isPending && merging === d.id
                  ? <Loader2 size={11} className="animate-spin" />
                  : <GitMerge size={11} />}
                Merge
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-600 mt-3">
        Merging keeps this lead&apos;s history and marks the duplicate as invalid.
      </p>
    </div>
  );
}

function UtmCard({ lead }: { lead: { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null } }) {
  const params = [
    { label: 'Source', value: lead.utmSource },
    { label: 'Medium', value: lead.utmMedium },
    { label: 'Campaign', value: lead.utmCampaign },
    { label: 'Content', value: lead.utmContent },
    { label: 'Term', value: lead.utmTerm },
  ].filter((p) => p.value);

  if (params.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
        <Link2 size={14} className="text-slate-400" /> UTM Attribution
      </h3>
      <dl className="space-y-2">
        {params.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center text-sm">
            <dt className="text-slate-400">utm_{label.toLowerCase()}</dt>
            <dd className="text-slate-700 font-medium text-right max-w-[60%] truncate" title={value!}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── Solar Score Card ─────────────────────────────────────────────────────────

interface SolarApiResult {
  city: string;
  coordinates: { lat: number; lng: number } | null;
  solarInsights: { maxArrayPanels: number; maxAreaM2: number; sunshineHoursPerYear: number } | null;
  proposal: {
    systemKw: number;
    totalCostInr: number;
    subsidyInr: number;
    netPayable: number;
    annualSavingsInr: number;
    paybackYears: number;
    roi25yr: number;
    emiMonthly: number;
    annualGenerationKwh: number;
    maxSunshineHoursPerYear: number;
    maxPanels: number;
    carbonOffsetKgPerYear: number;
  };
}

function SolarScoreCard({ lead }: { lead: { city?: string | null; factSheet?: Record<string, unknown> | null } }) {
  const [enabled, setEnabled] = useState(false);
  const monthlyBill = (() => {
    const p = lead.factSheet;
    if (!p) return 2000;
    const raw = p['monthly_bill'] ?? p['monthlyBill'] ?? p['bill'] ?? p['electricity_bill'] ?? '';
    const num = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    return isNaN(num) || num < 500 ? 2000 : num;
  })();

  const { data, isLoading, isError } = useQuery<SolarApiResult>({
    queryKey: ['solar-score', lead.city, monthlyBill],
    queryFn: async () => {
      const res = await fetch(`/api/solar?city=${encodeURIComponent(lead.city ?? 'Coimbatore')}&monthlyBill=${monthlyBill}`);
      if (!res.ok) throw new Error('Solar API failed');
      return res.json() as Promise<SolarApiResult>;
    },
    enabled: enabled && !!lead.city,
    staleTime: 30 * 60 * 1000,
  });

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
          <Sun size={14} className="text-amber-500" /> Solar Rooftop Score
        </h3>
        {!enabled && (
          <button
            onClick={() => setEnabled(true)}
            disabled={!lead.city}
            className="text-xs bg-amber-500 text-white px-3 py-1 rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Estimate
          </button>
        )}
      </div>

      {!enabled && (
        <p className="text-xs text-amber-700 opacity-70">
          {lead.city
            ? `Get Google Solar API rooftop analysis for ${lead.city}`
            : 'Add a city to this lead to enable solar scoring'}
        </p>
      )}

      {enabled && isLoading && (
        <div className="flex items-center gap-2 py-3">
          <Loader2 size={14} className="animate-spin text-amber-600" />
          <span className="text-xs text-amber-700">Analysing rooftop potential…</span>
        </div>
      )}

      {enabled && isError && (
        <p className="text-xs text-danger mt-1">Solar API unavailable. Configure GOOGLE_MAPS_API_KEY.</p>
      )}

      {enabled && data && (
        <div className="mt-3 space-y-3">
          {data.solarInsights && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-xs text-amber-700 font-medium">Sunshine</p>
                <p className="text-sm font-bold text-slate-800">{data.solarInsights.sunshineHoursPerYear}h/yr</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-xs text-amber-700 font-medium">Max Panels</p>
                <p className="text-sm font-bold text-slate-800">{data.solarInsights.maxArrayPanels}</p>
              </div>
            </div>
          )}
          <div className="bg-white rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <Zap size={11} className="text-amber-500" /> Recommended System
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-slate-500">System Size</span>
              <span className="font-semibold text-slate-800 text-right">{data.proposal.systemKw} kW</span>
              <span className="text-slate-500">Annual Generation</span>
              <span className="font-semibold text-slate-800 text-right">{data.proposal.annualGenerationKwh.toLocaleString()} kWh</span>
              <span className="text-slate-500">Total Cost</span>
              <span className="font-semibold text-slate-800 text-right">{fmt(data.proposal.totalCostInr)}</span>
              <span className="text-slate-500">PM Subsidy</span>
              <span className="font-semibold text-green-700 text-right">−{fmt(data.proposal.subsidyInr)}</span>
              <span className="text-slate-500">Net Payable</span>
              <span className="font-bold text-primary text-right">{fmt(data.proposal.netPayable)}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-green-50 rounded-lg p-2">
              <p className="text-[10px] text-green-700 font-medium flex items-center justify-center gap-0.5">
                <TrendingUp size={9} /> Savings/yr
              </p>
              <p className="text-xs font-bold text-green-800">{fmt(data.proposal.annualSavingsInr)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <p className="text-[10px] text-blue-700 font-medium">Payback</p>
              <p className="text-xs font-bold text-blue-800">{data.proposal.paybackYears} yrs</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2">
              <p className="text-[10px] text-emerald-700 font-medium flex items-center justify-center gap-0.5">
                <Leaf size={9} /> CO₂ saved
              </p>
              <p className="text-xs font-bold text-emerald-800">{Math.round(data.proposal.carbonOffsetKgPerYear / 1000)}T/yr</p>
            </div>
          </div>
          <p className="text-[10px] text-amber-600 text-center">
            Powered by Google Solar API · Estimate only
          </p>
        </div>
      )}
    </div>
  );
}

// ─── AI Solar Proposal ────────────────────────────────────────────────────────

interface QuickProposalProps {
  leadId: string;
  city?: string | null;
  factSheet?: Record<string, unknown> | null;
}

function AiSolarProposal({ leadId, city, factSheet }: QuickProposalProps) {
  const [open, setOpen] = useState(false);
  const [monthlyBill, setMonthlyBill] = useState(() => {
    const p = factSheet;
    const raw = p?.['monthly_bill'] ?? p?.['monthlyBill'] ?? p?.['bill'] ?? '';
    const n = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? '' : String(n);
  });
  const [systemKw, setSystemKw] = useState('');
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState<SolarApiResult['proposal'] | null>(null);

  async function handleGenerate() {
    const bill = parseInt(monthlyBill, 10);
    if (!bill || bill < 500) { toast.error('Enter a valid monthly bill (min ₹500)'); return; }
    setGenerating(true);
    try {
      const res = await fetch(`/api/solar?city=${encodeURIComponent(city ?? 'Coimbatore')}&monthlyBill=${bill}`);
      const data = (await res.json()) as SolarApiResult;
      setProposal(data.proposal);
      setSystemKw(String(data.proposal.systemKw));
    } catch {
      toast.error('Failed to generate proposal');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateQuotation() {
    if (!proposal) return;
    try {
      await api.post('/quotations', {
        leadId,
        systemKw: proposal.systemKw,
        brandTier: 'MID',
        totalInr: proposal.totalCostInr,
        subsidyInr: proposal.subsidyInr,
        netPayable: proposal.netPayable,
        emiMonthly: proposal.emiMonthly,
        paybackYears: proposal.paybackYears,
      });
      toast.success('Quotation created — find it in Quotations');
      setOpen(false);
    } catch {
      toast.error('Failed to create quotation');
    }
  }

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
      >
        <Sparkles size={14} /> Generate AI Solar Proposal
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <Sparkles size={14} className="text-amber-500" /> AI Solar Proposal
        </h3>
        <button onClick={() => { setOpen(false); setProposal(null); }} className="text-slate-400 hover:text-slate-600">
          <X size={15} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Electricity Bill (₹)</label>
          <input
            type="number"
            min="500"
            step="100"
            value={monthlyBill}
            onChange={(e) => setMonthlyBill(e.target.value)}
            placeholder="e.g. 3000"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
          <input
            readOnly
            value={city ?? 'Not set'}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500"
          />
        </div>
        <button
          onClick={() => void handleGenerate()}
          disabled={generating || !monthlyBill}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {generating ? <><Loader2 size={13} className="animate-spin" /> Calculating…</> : <><Zap size={13} /> Generate Proposal</>}
        </button>
      </div>

      {proposal && (
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-xs font-semibold text-slate-700">Recommended Solar System</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <span className="text-slate-500">System Size</span>
            <span className="font-bold text-slate-800">{systemKw} kW</span>
            <span className="text-slate-500">Generation/yr</span>
            <span className="font-bold text-slate-800">{proposal.annualGenerationKwh.toLocaleString()} kWh</span>
            <span className="text-slate-500">Total Cost</span>
            <span className="font-bold text-slate-800">{fmt(proposal.totalCostInr)}</span>
            <span className="text-slate-500">PM Surya Ghar Subsidy</span>
            <span className="font-bold text-green-700">−{fmt(proposal.subsidyInr)}</span>
            <span className="text-slate-500">Net Payable</span>
            <span className="font-bold text-primary text-base">{fmt(proposal.netPayable)}</span>
            <span className="text-slate-500">EMI (est.)</span>
            <span className="font-bold text-slate-800">{fmt(proposal.emiMonthly)}/mo</span>
            <span className="text-slate-500">Annual Savings</span>
            <span className="font-bold text-green-700">{fmt(proposal.annualSavingsInr)}</span>
            <span className="text-slate-500">Payback Period</span>
            <span className="font-bold text-slate-800">{proposal.paybackYears} years</span>
            <span className="text-slate-500">25-Year ROI</span>
            <span className="font-bold text-green-700">{fmt(proposal.roi25yr)}</span>
            <span className="text-slate-500">CO₂ Offset</span>
            <span className="font-bold text-emerald-700">{Math.round(proposal.carbonOffsetKgPerYear / 1000)}T/year</span>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-medium mb-1">PM Surya Ghar Yojana 2024</p>
            <p>Up to ₹78,000 subsidy for ≤3 kW systems. Interest-free EMI available via empanelled banks.</p>
          </div>
          <button
            onClick={() => void handleCreateQuotation()}
            className="w-full py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            Save as Quotation
          </button>
          <p className="text-[10px] text-slate-400 text-center">Estimates based on ₹7.50/unit tariff · Subject to site survey</p>
        </div>
      )}
    </div>
  );
}

function ReferralLinkCard({ leadId }: { leadId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/referral-link?leadId=${encodeURIComponent(leadId)}`);
      const data = (await res.json()) as { url: string };
      setUrl(data.url);
    } catch {
      toast.error('Failed to generate referral link');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const waText = url
    ? encodeURIComponent(
        `I switched to solar with Excess Renew and I'm saving ₹3000/month! Get your free estimate: ${url}`,
      )
    : '';

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <Share2 size={15} className="text-primary" />
        <h3 className="text-sm font-semibold text-slate-700">Referral Link</h3>
      </div>

      {!url ? (
        <button
          onClick={() => void generate()}
          disabled={loading}
          className="w-full py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-60"
        >
          {loading ? 'Generating…' : 'Generate Link'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 truncate"
            />
            <button
              onClick={() => void copyLink()}
              className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg font-medium text-slate-700 whitespace-nowrap"
            >
              {copied ? 'Copied!' : <Copy size={13} />}
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 text-sm bg-[#25D366] text-white rounded-lg hover:bg-[#1db855] font-medium"
          >
            <MessageSquare size={13} /> Share on WhatsApp
          </a>
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-2">Earn ₹5,000 for every successful installation via your link</p>
    </div>
  );
}

function CallInsightsMini({ callId }: { callId: string }) {
  const [open, setOpen] = useState(false);
  const { data: insights, isLoading } = useCallInsights(open ? callId : null);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] text-primary hover:underline mt-1 inline-flex items-center gap-1"
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {open ? 'Hide insights' : 'View insights'}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 border border-border p-3 text-xs space-y-1.5">
          {isLoading && <p className="text-slate-400">Loading…</p>}
          {insights && (
            <>
              {insights.summary && (
                <div className="pb-1.5 mb-1.5 border-b border-border">
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    <Sparkles size={11} /> AI summary
                  </span>
                  <p className="mt-1 text-slate-700 leading-relaxed whitespace-pre-line">{insights.summary}</p>
                </div>
              )}
              <p className="font-medium text-slate-700">Interest: <span className={
                insights.interestLevel === 'High' ? 'text-success' :
                insights.interestLevel === 'Medium' ? 'text-amber-600' : 'text-slate-500'
              }>{insights.interestLevel}</span></p>
              {insights.painPoints.length > 0 && (
                <p className="text-slate-600"><span className="font-medium">Pain points:</span> {insights.painPoints.join(', ')}</p>
              )}
              {insights.objections.length > 0 && (
                <p className="text-slate-600"><span className="font-medium">Objections:</span> {insights.objections.join(', ')}</p>
              )}
              <p className="text-primary font-medium">→ {insights.nextAction}</p>
            </>
          )}
          {!isLoading && !insights && (
            <p className="text-slate-400">No transcript available</p>
          )}
        </div>
      )}
    </div>
  );
}

interface LeadDetailViewProps {
  id: string;
}

export function LeadDetailView({ id }: LeadDetailViewProps) {
  const { data: lead, isLoading, isError } = useLeadDetail(id);
  const { mutate: updateLead, isPending } = useUpdateLead();
  const computeScore = useComputeLeadScore();
  const [editingStage, setEditingStage] = useState(false);
  const [converting, setConverting] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const sendEmail = useSendLeadEmail(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-white rounded-xl animate-pulse" />
        <div className="h-48 bg-white rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-danger">Lead not found.</p>
        <Link href="/leads" className="text-sm text-primary hover:underline mt-2 inline-block">← Back to leads</Link>
      </div>
    );
  }

  function changeStage(stage: string) {
    // Converting needs the system size (kW) for the commission — use the modal.
    if (stage === 'CONVERTED') {
      setEditingStage(false);
      setConverting(true);
      return;
    }
    updateLead(
      { id, data: { stage } },
      {
        onSuccess: () => {
          toast.success(`Stage → ${stage.replace(/_/g, ' ')}`);
          setEditingStage(false);
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
          if (axiosErr.response?.data?.error?.code === 'stage_gate.blocked') {
            toast.error(axiosErr.response.data.error.message ?? 'Stage gate blocked this transition');
          } else {
            toast.error('Failed to update stage');
          }
        },
      },
    );
  }

  function addNote() {
    if (!noteText.trim()) return;
    updateLead(
      { id, data: { notes: noteText } },
      {
        onSuccess: () => {
          toast.success('Note added');
          setNoteText('');
          setAddingNote(false);
        },
        onError: () => toast.error('Failed to add note'),
      },
    );
  }

  const activities =
    (lead as unknown as {
      activities?: { id: string; type: string; payload: Record<string, unknown>; createdAt: string; actorIsAi?: boolean }[];
    }).activities ?? [];
  const calls =
    (lead as unknown as {
      calls?: { id: string; status: string; persona: string; direction: string; durationSec: number | null; initiatedAt: string; connectedAt?: string | null }[];
    }).calls ?? [];

  function renderActivityText(act: { type: string; payload: Record<string, unknown> }) {
    const p = act.payload;
    switch (act.type) {
      case 'NOTE':
        return String(p['note'] ?? '');
      case 'STAGE_CHANGE':
        return `Stage changed to ${String(p['newStage'] ?? '').replace(/_/g, ' ')}`;
      case 'ASSIGNMENT':
        return `Assigned to a team member`;
      case 'CALL':
        return `Call ${String(p['direction'] ?? 'outbound')} • ${String(p['status'] ?? '')}`;
      case 'QUOTATION_SENT':
        return `Quotation sent via ${String(p['sentVia'] ?? 'email')}`;
      case 'APPOINTMENT_BOOKED':
        return `Appointment scheduled`;
      case 'WHATSAPP':
        return `WhatsApp message: ${String(p['text'] ?? '').slice(0, 80)}`;
      case 'EMAIL':
        return `Email sent: "${String(p['subject'] ?? '')}" → ${String(p['to'] ?? '')}`;
      default:
        return act.type.replace(/_/g, ' ').toLowerCase();
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/leads" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Leads
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-medium">{lead.name}</span>
      </div>

      {/* SLA banner */}
      <SlaBanner stage={lead.stage} stageChangedAt={lead.stageChangedAt} />

      {/* AI next-best-action */}
      <NextActionCard leadId={id} />

      {converting && (
        <ConvertLeadModal leadId={id} onClose={() => setConverting(false)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Lead header band */}
          <div className="bg-white rounded-xl border border-border p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                {lead.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-800">{lead.name}</h1>
                  {editingStage ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        autoFocus
                        defaultValue={lead.stage}
                        onChange={(e) => changeStage(e.target.value)}
                        className="text-sm border border-primary rounded-lg px-2 py-1 focus:outline-none"
                        disabled={isPending}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                      <button onClick={() => setEditingStage(false)}>
                        <X size={16} className="text-slate-400" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingStage(true)} className="group flex items-center gap-1.5">
                      <StageBadge stage={lead.stage} />
                      <Edit2 size={12} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-primary transition-colors">
                    <Phone size={14} /> {lead.phone}
                  </a>
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-sm text-slate-600 hover:text-primary transition-colors">
                      <Mail size={14} /> {lead.email}
                    </a>
                  )}
                  {lead.city && (
                    <span className="flex items-center gap-1 text-sm text-slate-600">
                      <MapPin size={14} /> {lead.city}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stat strip — key intelligence at a glance */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border">
              <div className="bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">AI Score</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <ScoreWithBreakdown score={lead.aiScore} breakdown={lead.aiScoreBreakdown} />
                  <button
                    onClick={() => computeScore.mutate(lead.id, {
                      onSuccess: () => toast.success('Score refreshed'),
                      onError: () => toast.error('Failed to refresh score'),
                    })}
                    disabled={computeScore.isPending}
                    className="text-slate-400 hover:text-primary transition-colors"
                    title="Refresh score"
                  >
                    <RefreshCw size={11} className={computeScore.isPending ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              <div className="bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Source</p>
                <p className="mt-1 text-sm font-semibold text-slate-700 truncate">{SOURCE_LABELS[lead.sourceType] ?? lead.sourceType}</p>
              </div>
              <div className="bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">In stage</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{formatDistanceToNow(new Date(lead.stageChangedAt))}</p>
              </div>
              <div className="bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Received</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{format(new Date(lead.createdAt), 'MMM d, yyyy')}</p>
              </div>
            </div>
          </div>

          {/* Duplicates — only shown when same-phone leads exist */}
          <DuplicatesCard masterId={id} />

          {/* Activity feed */}
          <div className="bg-white rounded-xl border border-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-slate-800">Activity</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setEmailOpen(!emailOpen); setAddingNote(false); }}
                  className="flex items-center gap-1 text-sm text-violet-600 hover:underline font-medium"
                >
                  <Mail size={13} /> Email
                </button>
                <button
                  onClick={() => { setAddingNote(!addingNote); setEmailOpen(false); }}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  + Add note
                </button>
              </div>
            </div>

            {addingNote && (
              <div className="px-5 py-4 border-b border-border bg-slate-50/50">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Write a note about this lead..."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2 mt-2 justify-end">
                  <button onClick={() => { setAddingNote(false); setNoteText(''); }} className="text-sm text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                  <button
                    onClick={addNote}
                    disabled={!noteText.trim() || isPending}
                    className="flex items-center gap-1.5 text-sm bg-primary text-white px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-primary/90"
                  >
                    <Check size={14} /> Save note
                  </button>
                </div>
              </div>
            )}

            {emailOpen && (
              <div className="px-5 py-4 border-b border-border bg-violet-50/40">
                <p className="text-xs font-semibold text-violet-700 mb-3 flex items-center gap-1.5">
                  <Mail size={13} /> Compose Email → {lead.email ?? 'No email on file'}
                </p>
                {!lead.email && (
                  <p className="text-xs text-danger mb-2">This lead has no email address. Add one first.</p>
                )}
                <input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject..."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white mb-2"
                />
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Email body..."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                  rows={4}
                />
                <div className="flex gap-2 mt-2 justify-end">
                  <button onClick={() => { setEmailOpen(false); setEmailSubject(''); setEmailBody(''); }} className="text-sm text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!emailSubject.trim() || !emailBody.trim()) return;
                      sendEmail.mutate({ subject: emailSubject, body: emailBody }, {
                        onSuccess: () => { toast.success('Email sent'); setEmailOpen(false); setEmailSubject(''); setEmailBody(''); },
                        onError: () => toast.error('Failed to send email'),
                      });
                    }}
                    disabled={!emailSubject.trim() || !emailBody.trim() || !lead.email || sendEmail.isPending}
                    className="flex items-center gap-1.5 text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-violet-700"
                  >
                    {sendEmail.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send Email
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-border">
              {activities.length === 0 && (
                <p className="px-5 py-8 text-sm text-slate-400 text-center">No activity yet.</p>
              )}
              {activities.map((act) => {
                const cfg = ACTIVITY_CONFIG[act.type] ?? { icon: FileText, color: 'text-slate-500 bg-slate-100', label: act.type };
                const Icon = cfg.icon;
                return (
                  <div key={act.id} className="flex gap-3.5 px-5 py-4">
                    <div className={`w-7 h-7 rounded-full ${cfg.color} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 leading-snug">{renderActivityText(act)}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {act.actorIsAi ? (
                          <span className="text-primary font-medium">AI · </span>
                        ) : null}
                        {format(new Date(act.createdAt), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calls */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Calls</h2>
              <span className="text-xs text-slate-400">{calls.length} total</span>
            </div>
            <div className="divide-y divide-border">
              {calls.length === 0 && (
                <p className="px-5 py-5 text-sm text-slate-400 text-center">No calls yet.</p>
              )}
              {calls.slice(0, 8).map((call) => (
                <div key={call.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      {call.persona.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs font-medium ${
                      call.status === 'COMPLETED' ? 'text-success' :
                      call.status === 'FAILED' || call.status === 'NO_ANSWER' ? 'text-danger' :
                      'text-slate-500'
                    }`}>
                      {call.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span>{format(new Date(call.initiatedAt), 'MMM d, h:mm a')}</span>
                    {call.durationSec && <span>· {Math.floor(call.durationSec / 60)}m {call.durationSec % 60}s</span>}
                  </div>
                  {call.status === 'COMPLETED' && <CallInsightsMini callId={call.id} />}
                </div>
              ))}
            </div>
          </div>

          {/* WhatsApp inline thread */}
          <WhatsAppThread leadId={id} leadName={lead.name} leadPhone={lead.phone} />
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-4">
          {/* UTM Attribution */}
          <UtmCard lead={lead} />

          {/* Appointments */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-slate-800">Appointments</h2>
            </div>
            <div className="px-5 py-4">
              <AppointmentsList leadId={id} />
            </div>
          </div>

          {/* Assignment */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Assignment</h3>
            <AssignLeadPanel leadId={lead.id} currentOwnerId={lead.ownerUserId ?? null} />
          </div>

          {/* Tags */}
          <LeadTagsCard
            leadId={lead.id}
            tags={lead.tags}
          />

          {/* AI Summary */}
          <LeadSummaryCard leadId={lead.id} />

          {/* Solar Rooftop Score */}
          <SolarScoreCard lead={{ city: lead.city, factSheet: lead.factSheet }} />

          {/* AI Solar Proposal */}
          <AiSolarProposal
            leadId={lead.id}
            city={lead.city}
            factSheet={lead.factSheet}
          />

          {/* Referral Link — only for converted customers */}
          {lead.stage === 'CONVERTED' && (
            <ReferralLinkCard leadId={lead.id} />
          )}
        </div>
      </div>
    </div>
  );
}

function WhatsAppThread({ leadId, leadName, leadPhone }: { leadId: string; leadName: string; leadPhone: string }) {
  const [draft, setDraft] = useState('');
  const [sendErr, setSendErr] = useState<string | null>(null);
  const { messages, loading } = useMessages(leadId);
  const { send, loading: sending } = useSendMessage();
  const { data: status } = useWhatsappStatus();
  const { draftReply, drafting } = useDraftReply();

  async function handleDraft() {
    setSendErr(null);
    try {
      const text = await draftReply(leadId, 'whatsapp');
      setDraft(text);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setSendErr(axiosErr.response?.data?.error?.message ?? 'Could not draft a reply right now.');
    }
  }

  // Treat status as connected until we know otherwise, so we don't flash the
  // warning while the status query is loading.
  const connected = status?.connected !== false;

  const waMessages = messages
    .filter((m) => m.type === 'WHATSAPP')
    .slice(-10);

  async function handleSend() {
    if (!draft.trim()) return;
    setSendErr(null);
    try {
      await send(leadId, draft.trim());
      setDraft('');
    } catch (err: unknown) {
      setSendErr(err instanceof Error ? err.message : 'Failed to send');
    }
  }

  return (
    <div className="bg-white rounded-xl border border-border">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <MessageSquare size={15} className="text-emerald-500" />
        <h2 className="font-semibold text-slate-800">WhatsApp — {leadName}</h2>
        <span
          className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-success' : 'bg-slate-300'}`}
          title={connected ? 'WhatsApp connected' : 'WhatsApp not connected'}
        />
        <span className="text-xs text-slate-400 ml-auto">{leadPhone}</span>
      </div>

      {!connected && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          WhatsApp isn&apos;t connected yet, so messages won&apos;t be delivered.{' '}
          <Link href="/whatsapp" className="font-semibold underline hover:no-underline">
            Connect it in Settings
          </Link>{' '}
          to start sending.
        </div>
      )}

      <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
        {loading && waMessages.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">Loading messages…</p>
        )}
        {!loading && waMessages.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No WhatsApp messages yet. Send the first one below.</p>
        )}
        {waMessages.map((msg) => {
            const text = (msg.payload.message as string | undefined) ?? (msg.payload.template as string | undefined) ?? '[message]';
            const isOutbound = (msg.payload.direction as string | undefined) === 'outbound' || (!msg.payload.direction && msg.actorIsAi);
            return (
              <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-1.5 rounded-xl text-sm ${isOutbound ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  <p className="text-sm leading-snug">{text}</p>
                  <p className={`text-[10px] mt-0.5 ${isOutbound ? 'text-blue-100' : 'text-slate-400'}`}>
                    {format(new Date(msg.createdAt), 'h:mm a')}
                  </p>
                </div>
              </div>
            );
          })}
      </div>

      <div className="px-4 py-3 border-t border-border space-y-2">
        {sendErr && <p className="text-xs text-danger">{sendErr}</p>}
        <button
          type="button"
          onClick={() => void handleDraft()}
          disabled={drafting}
          title="Generate a reply with AI — you can edit it before sending"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-60 transition-colors"
        >
          {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {drafting ? 'Drafting…' : 'Draft with AI'}
        </button>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder={connected ? 'Send a WhatsApp message…' : 'Connect WhatsApp to send messages'}
            disabled={!connected}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending || !draft.trim() || !connected}
            className="px-3 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
