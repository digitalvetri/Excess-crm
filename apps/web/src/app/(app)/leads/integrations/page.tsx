'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  Plug,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  BarChart3,
  Facebook,
} from 'lucide-react';
import {
  useIntegrations,
  useCreateIntegration,
  useUpdateIntegration,
  useDeleteIntegration,
  useVerifyIntegration,
  useSyncIntegration,
  type IntegrationSource,
  type IntegrationType,
} from '@/hooks/use-integrations';

// ─── Utility ──────────────────────────────────────────────────────────────────

function generateSecret(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function copyToClipboard(text: string, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => toast.success(label));
}

// ─── Integration definitions ──────────────────────────────────────────────────

const INTEGRATIONS: {
  type: IntegrationType;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  leadsLabel: string;
}[] = [
  {
    type: 'JUSTDIAL',
    name: 'JustDial',
    description: 'Receive enquiries from JustDial automatically via webhook. Every new lead is captured and queued for AI verification.',
    icon: Zap,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    leadsLabel: 'JustDial leads captured',
  },
  {
    type: 'INDIAMART',
    name: 'IndiaMART',
    description: 'Pull leads from your IndiaMART CRM account using their API. Supports scheduled pulls and real-time webhooks.',
    icon: BarChart3,
    color: 'text-green-700',
    bg: 'bg-green-50',
    leadsLabel: 'IndiaMART leads imported',
  },
  {
    type: 'META',
    name: 'Meta Lead Ads',
    description: 'Capture leads from Facebook & Instagram Lead Ad forms. Map form fields to CRM fields and sync historical leads.',
    icon: Facebook,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    leadsLabel: 'Meta leads captured',
  },
];

// ─── JustDial config panel ────────────────────────────────────────────────────

function JustDialPanel({ source }: { source: IntegrationSource | undefined }) {
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const create = useCreateIntegration();
  const update = useUpdateIntegration();
  const verify = useVerifyIntegration();
  const del = useDeleteIntegration();

  const webhookUrl = source?.config.webhookUrl ?? `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8000'}/webhooks/justdial`;

  async function save() {
    if (!secret || secret.length < 8) {
      toast.error('Secret must be at least 8 characters');
      return;
    }
    if (source) {
      await update.mutateAsync({ id: source.id, data: { config: { secret } } });
      toast.success('Secret key updated');
    } else {
      await create.mutateAsync({ type: 'JUSTDIAL', label: 'JustDial', config: { secret } });
      toast.success('JustDial integration created');
    }
    setSecret('');
  }

  async function handleVerify() {
    if (!source) return;
    try {
      const res = await verify.mutateAsync(source.id);
      toast.success(res.message ?? 'Webhook active');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Verification failed');
    }
  }

  return (
    <div className="space-y-5">
      {/* Webhook URL */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          Webhook URL
        </label>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={webhookUrl}
            className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-slate-50 font-mono text-slate-700"
          />
          <button
            onClick={() => copyToClipboard(webhookUrl, 'Webhook URL copied')}
            className="p-2 rounded-lg border border-border hover:bg-slate-50 text-slate-500 transition-colors"
            title="Copy webhook URL"
          >
            <Copy size={15} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">Share this URL with JustDial support to receive leads.</p>
      </div>

      {/* Secret key */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          {source?.config.hasSecret ? 'Update Secret Key' : 'Secret Key'}
        </label>
        {source?.config.hasSecret && (
          <p className="text-xs text-success font-medium flex items-center gap-1 mb-2">
            <CheckCircle2 size={13} /> Secret key is configured
          </p>
        )}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={source?.config.hasSecret ? 'Enter new secret to replace...' : 'Enter or generate a secret key...'}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <button
            onClick={() => setSecret(generateSecret())}
            className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-slate-50 text-slate-600 transition-colors whitespace-nowrap"
          >
            Generate
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          This secret must be included as <code className="font-mono bg-slate-100 px-1 rounded">key</code> in every JustDial POST payload.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <button
          onClick={save}
          disabled={!secret || secret.length < 8 || create.isPending || update.isPending}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {create.isPending || update.isPending ? (
            <Loader2 size={14} className="animate-spin inline mr-1" />
          ) : null}
          {source ? 'Update Secret' : 'Save Integration'}
        </button>

        {source && (
          <button
            onClick={handleVerify}
            disabled={verify.isPending}
            className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            {verify.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
            Test Connection
          </button>
        )}

        {source && (
          <button
            onClick={() => {
              if (confirm('Deactivate this integration? Leads will stop coming in.')) {
                del.mutate(source.id, { onSuccess: () => toast.success('Integration deactivated') });
              }
            }}
            className="ml-auto text-sm text-danger hover:underline"
          >
            Deactivate
          </button>
        )}
      </div>
    </div>
  );
}

// ─── IndiaMART config panel ───────────────────────────────────────────────────

function IndiaMartPanel({ source }: { source: IntegrationSource | undefined }) {
  const [apiKey, setApiKey] = useState('');
  const [mobile, setMobile] = useState(source?.config.mobile ?? '');
  const [pullFrequency, setPullFrequency] = useState<'manual' | 'daily' | 'hourly'>(
    source?.config.pullFrequency ?? 'daily',
  );
  const [showKey, setShowKey] = useState(false);

  const create = useCreateIntegration();
  const update = useUpdateIntegration();
  const verify = useVerifyIntegration();
  const sync = useSyncIntegration();
  const del = useDeleteIntegration();

  async function save() {
    const config: Record<string, unknown> = { pullFrequency };
    if (apiKey) config['apiKey'] = apiKey;
    if (mobile) config['mobile'] = mobile;

    if (source) {
      await update.mutateAsync({ id: source.id, data: { config } });
      toast.success('IndiaMART settings updated');
    } else {
      if (!apiKey || !mobile) {
        toast.error('API Key and Mobile are required');
        return;
      }
      await create.mutateAsync({ type: 'INDIAMART', label: 'IndiaMART', config: { apiKey, mobile, pullFrequency } });
      toast.success('IndiaMART integration connected');
    }
    setApiKey('');
  }

  async function handleVerify() {
    if (!source) return;
    try {
      const res = await verify.mutateAsync(source.id);
      toast.success(res.message ?? 'Credentials verified');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Verification failed');
    }
  }

  async function handleSync() {
    if (!source) return;
    try {
      await sync.mutateAsync(source.id);
      toast.success('Sync triggered — leads will appear shortly');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Sync failed');
    }
  }

  return (
    <div className="space-y-5">
      {/* API Key */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          {source?.config.hasApiKey ? 'Update API Key' : 'IndiaMART API Key'}
        </label>
        {source?.config.hasApiKey && (
          <p className="text-xs text-success font-medium flex items-center gap-1 mb-2">
            <CheckCircle2 size={13} /> API key is configured
          </p>
        )}
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={source?.config.hasApiKey ? 'Enter new API key to replace...' : 'Paste your IndiaMART CRM API key...'}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Found in IndiaMART → My Account → CRM API → API Key.
        </p>
      </div>

      {/* Mobile */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          Registered Mobile
        </label>
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="10-digit mobile linked to IndiaMART"
          maxLength={10}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Pull frequency */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          Auto-pull Frequency
        </label>
        <select
          value={pullFrequency}
          onChange={(e) => setPullFrequency(e.target.value as typeof pullFrequency)}
          className="text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        >
          <option value="hourly">Every hour</option>
          <option value="daily">Daily (recommended)</option>
          <option value="manual">Manual only</option>
        </select>
        <p className="text-xs text-slate-500 mt-1">We'll also capture leads via webhook in real time.</p>
      </div>

      {source?.lastSyncAt && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <RefreshCw size={12} />
          Last sync {formatDistanceToNow(new Date(source.lastSyncAt), { addSuffix: true })}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        <button
          onClick={save}
          disabled={create.isPending || update.isPending}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {create.isPending || update.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
          {source ? 'Save Settings' : 'Connect IndiaMART'}
        </button>

        {source && (
          <button
            onClick={handleVerify}
            disabled={verify.isPending}
            className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            {verify.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
            Verify Credentials
          </button>
        )}

        {source && (
          <button
            onClick={handleSync}
            disabled={sync.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-lg hover:bg-green-100 transition-colors"
          >
            {sync.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Pull Now
          </button>
        )}

        {source && (
          <button
            onClick={() => {
              if (confirm('Deactivate IndiaMART integration?')) {
                del.mutate(source.id, { onSuccess: () => toast.success('Integration deactivated') });
              }
            }}
            className="ml-auto text-sm text-danger hover:underline"
          >
            Deactivate
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Meta config panel ────────────────────────────────────────────────────────

const META_FIELD_MAP_KEYS = [
  { field: 'full_name', label: 'Full Name' },
  { field: 'phone_number', label: 'Phone Number' },
  { field: 'email', label: 'Email' },
  { field: 'city', label: 'City' },
  { field: 'pincode', label: 'Pincode' },
];

function MetaPanel({ source }: { source: IntegrationSource | undefined }) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>(
    source?.config.fieldMapping ?? {},
  );

  const create = useCreateIntegration();
  const update = useUpdateIntegration();
  const verify = useVerifyIntegration();
  const del = useDeleteIntegration();

  const webhookUrl = `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8000'}/webhooks/meta`;

  async function save() {
    const config: Record<string, unknown> = { fieldMapping };
    if (token) config['pageAccessToken'] = token;

    if (source) {
      await update.mutateAsync({ id: source.id, data: { config } });
      toast.success('Meta integration updated');
    } else {
      if (!token) {
        toast.error('Page Access Token is required');
        return;
      }
      await create.mutateAsync({ type: 'META', label: 'Meta Lead Ads', config: { pageAccessToken: token, fieldMapping } });
      toast.success('Meta integration configured');
    }
    setToken('');
  }

  async function handleVerify() {
    if (!source) return;
    try {
      const res = await verify.mutateAsync(source.id);
      toast.success(res.message ?? 'Connected successfully');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Verification failed');
    }
  }

  return (
    <div className="space-y-5">
      {/* Webhook URL */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          Meta Webhook URL
        </label>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={webhookUrl}
            className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-slate-50 font-mono text-slate-700"
          />
          <button
            onClick={() => copyToClipboard(webhookUrl, 'Webhook URL copied')}
            className="p-2 rounded-lg border border-border hover:bg-slate-50 text-slate-500 transition-colors"
          >
            <Copy size={15} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Add this as the callback URL in your Meta App → Webhooks → leads subscription.
        </p>
      </div>

      {/* Page Access Token */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          {source?.config.hasToken ? 'Update Page Access Token' : 'Page Access Token'}
        </label>
        {source?.config.hasToken && (
          <div className="mb-2 space-y-0.5">
            <p className="text-xs text-success font-medium flex items-center gap-1">
              <CheckCircle2 size={13} /> Token is configured
            </p>
            {source.config.pageName && (
              <p className="text-xs text-slate-500">Connected to: <span className="font-medium text-slate-700">{source.config.pageName}</span></p>
            )}
          </div>
        )}
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={source?.config.hasToken ? 'Enter new token to replace...' : 'Paste your Page Access Token...'}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Generate a never-expiring token from Facebook Developer Console → Your App → Tools → Graph API Explorer.
        </p>
      </div>

      {/* Field Mapping */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
          Field Mapping <span className="font-normal text-slate-400 normal-case">(map your form fields to CRM fields)</span>
        </label>
        <div className="space-y-2">
          {META_FIELD_MAP_KEYS.map(({ field, label }) => (
            <div key={field} className="flex items-center gap-3">
              <span className="text-sm text-slate-600 w-28 shrink-0">{label}</span>
              <span className="text-slate-300">→</span>
              <input
                type="text"
                value={fieldMapping[field] ?? ''}
                onChange={(e) => setFieldMapping({ ...fieldMapping, [field]: e.target.value })}
                placeholder={`Your form's ${field} field name`}
                className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        <button
          onClick={save}
          disabled={create.isPending || update.isPending}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {create.isPending || update.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
          {source ? 'Save Settings' : 'Save Integration'}
        </button>

        {source && (
          <button
            onClick={handleVerify}
            disabled={verify.isPending}
            className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            {verify.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
            Verify Token
          </button>
        )}

        {source && (
          <button
            onClick={() => {
              if (confirm('Deactivate Meta integration?')) {
                del.mutate(source.id, { onSuccess: () => toast.success('Integration deactivated') });
              }
            }}
            className="ml-auto text-sm text-danger hover:underline"
          >
            Deactivate
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({
  defn,
  source,
}: {
  defn: (typeof INTEGRATIONS)[number];
  source: IntegrationSource | undefined;
}) {
  const [open, setOpen] = useState(false);
  const Icon = defn.icon;

  const connected = !!source?.isActive;

  return (
    <div className={`bg-white rounded-xl border ${connected ? 'border-border' : 'border-border'} overflow-hidden`}>
      {/* Card header */}
      <button
        className="w-full flex items-start gap-4 p-5 text-left hover:bg-slate-50/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className={`w-11 h-11 rounded-xl ${defn.bg} flex items-center justify-center shrink-0`}>
          <Icon size={22} className={defn.color} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800">{defn.name}</span>
            {connected ? (
              <span className="flex items-center gap-1 text-xs font-medium text-success">
                <CheckCircle2 size={12} /> Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-medium text-slate-400">
                <XCircle size={12} /> Not configured
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{defn.description}</p>
          {connected && source && (
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{source._count.leads.toLocaleString()}</span> {defn.leadsLabel}
              {source.lastSyncAt && (
                <span>· Last sync {formatDistanceToNow(new Date(source.lastSyncAt), { addSuffix: true })}</span>
              )}
            </div>
          )}
        </div>

        <div className="text-slate-400 shrink-0 mt-1">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Config panel (slide-down) */}
      {open && (
        <div className="border-t border-border bg-slate-50/30 p-5">
          {defn.type === 'JUSTDIAL' && <JustDialPanel source={source} />}
          {defn.type === 'INDIAMART' && <IndiaMartPanel source={source} />}
          {defn.type === 'META' && <MetaPanel source={source} />}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: sources, isLoading } = useIntegrations();

  const getSource = (type: IntegrationType) => sources?.find((s) => s.type === type && s.isActive);

  const totalLeads = sources?.reduce((sum, s) => sum + s._count.leads, 0) ?? 0;
  const activeCount = sources?.filter((s) => s.isActive).length ?? 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Plug size={20} className="text-primary" />
            Lead Integrations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Connect your lead sources to automatically capture, deduplicate, and qualify incoming leads.
          </p>
        </div>
        {!isLoading && (
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-slate-800">{totalLeads.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{activeCount} active integration{activeCount !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {INTEGRATIONS.map((defn) => (
            <IntegrationCard key={defn.type} defn={defn} source={getSource(defn.type)} />
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">How it works</p>
        <ul className="space-y-1 text-xs text-blue-600 list-disc list-inside">
          <li>All incoming leads are deduplicated by phone number before insertion</li>
          <li>New leads are immediately queued for AI voice verification</li>
          <li>Leads that match DND list or business hours are held automatically</li>
        </ul>
      </div>
    </div>
  );
}
