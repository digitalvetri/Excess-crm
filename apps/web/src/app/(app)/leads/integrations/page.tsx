'use client';

import { useState, useEffect } from 'react';
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
  ArrowLeft,
  ArrowRight,
  Link2Off,
} from 'lucide-react';
import {
  useIntegrations,
  useIntegrationHealth,
  useCreateIntegration,
  useUpdateIntegration,
  useDeleteIntegration,
  useVerifyIntegration,
  useSyncIntegration,
  useMetaOAuthUrl,
  useMetaPages,
  useMetaPageForms,
  useMetaConnect,
  type IntegrationSource,
  type IntegrationType,
  type IntegrationHealthEntry,
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

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const webhookUrl = source?.config.webhookUrl ?? `${origin}/api/v1/webhooks/justdial`;

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
        <p className="text-xs text-slate-500 mt-1">We&apos;ll also capture leads via webhook in real time.</p>
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

// ─── Facebook OAuth wizard panel ──────────────────────────────────────────────

function FacebookPanel({ source }: { source: IntegrationSource | undefined }) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string>('all');
  const [selectedFormName, setSelectedFormName] = useState<string | null>(null);
  const [inWizard, setInWizard] = useState(false);

  const isConnected = source?.isActive && !!source.config.pageId;
  const hasPending = source?.config.hasPendingPages;

  const step: 'connect' | 'pick-page' | 'pick-form' | 'connected' = (() => {
    if (isConnected) return 'connected';
    if (hasPending && (inWizard || selectedPageId)) return 'pick-form';
    if (hasPending) return 'pick-page';
    return 'connect';
  })();

  const oauthUrl = useMetaOAuthUrl();
  const pages = useMetaPages(step === 'pick-page' || step === 'pick-form');
  const forms = useMetaPageForms(selectedPageId);
  const connect = useMetaConnect();
  const del = useDeleteIntegration();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fb = params.get('fb');
    if (fb === 'error') toast.error('Facebook connection failed. Please try again.');
    if (fb === 'cancelled') toast.info('Facebook connection was cancelled.');
    if (fb) {
      const url = new URL(window.location.href);
      url.searchParams.delete('fb');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  async function handleConnect() {
    try {
      const url = await oauthUrl.mutateAsync();
      window.location.href = url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Could not start Facebook connection. Try again.');
    }
  }

  function handlePageSelect(pageId: string) {
    setSelectedPageId(pageId);
    setSelectedFormId('all');
    setSelectedFormName(null);
    setInWizard(true);
  }

  async function handleFinish() {
    if (!source || !selectedPageId) return;
    try {
      const result = await connect.mutateAsync({
        sourceId: source.id,
        pageId: selectedPageId,
        ...(selectedFormId !== 'all' && { formId: selectedFormId }),
        ...(selectedFormId !== 'all' && selectedFormName && { formName: selectedFormName }),
      });
      toast.success(result.message);
      setInWizard(false);
      setSelectedPageId(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Connection failed. Please try again.');
    }
  }

  // ── Step: connected ──────────────────────────────────────────────────────
  if (step === 'connected') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
          <CheckCircle2 size={20} className="text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Connected to Facebook</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Page: <span className="font-medium text-slate-700">{source!.config.pageName}</span>
            </p>
            <p className="text-xs text-slate-500">
              Capturing:{' '}
              <span className="font-medium text-slate-700">
                {source!.config.formName ?? (source!.config.formId ? source!.config.formId : 'All lead forms')}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="font-medium text-slate-700 text-sm">{source!._count.leads.toLocaleString()}</span>
          Meta leads captured
        </div>

        <div className="pt-2 border-t border-border flex items-center gap-3">
          <button
            onClick={() => {
              if (confirm('Disconnect Facebook integration? Leads will stop coming in.')) {
                del.mutate(source!.id, { onSuccess: () => toast.success('Disconnected from Facebook') });
              }
            }}
            className="flex items-center gap-1.5 text-sm text-danger hover:underline"
          >
            <Link2Off size={14} /> Disconnect
          </button>
          <button
            onClick={handleConnect}
            disabled={oauthUrl.isPending}
            className="ml-auto text-sm text-slate-500 hover:text-slate-700 hover:underline"
          >
            {oauthUrl.isPending ? <Loader2 size={13} className="animate-spin inline mr-1" /> : null}
            Reconnect with different account
          </button>
        </div>
      </div>
    );
  }

  // ── Step: pick-page ──────────────────────────────────────────────────────
  if (step === 'pick-page') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Select a Facebook Page</p>
          <p className="text-xs text-slate-500 mt-0.5">Which page is running your Lead Ads?</p>
        </div>

        {pages.isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : pages.isError ? (
          <p className="text-sm text-danger">Could not load pages. Try reconnecting.</p>
        ) : (
          <div className="space-y-2">
            {(pages.data?.pages ?? []).map((page) => (
              <button
                key={page.id}
                onClick={() => handlePageSelect(page.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-border rounded-lg hover:border-primary hover:bg-blue-50/50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Facebook size={16} className="text-blue-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{page.name}</p>
                  {page.category && <p className="text-xs text-slate-400">{page.category}</p>}
                </div>
                <ArrowRight size={16} className="text-slate-400 shrink-0" />
              </button>
            ))}
            {(pages.data?.pages ?? []).length === 0 && (
              <p className="text-sm text-slate-500 py-2">No pages found. Make sure you manage at least one Facebook Page.</p>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-border">
          <button
            onClick={handleConnect}
            disabled={oauthUrl.isPending}
            className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
          >
            {oauthUrl.isPending ? <Loader2 size={13} className="animate-spin inline mr-1" /> : null}
            Connect with a different account
          </button>
        </div>
      </div>
    );
  }

  // ── Step: pick-form ──────────────────────────────────────────────────────
  if (step === 'pick-form') {
    const selectedPageName = pages.data?.pages.find((p) => p.id === selectedPageId)?.name ?? selectedPageId;

    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Select a Lead Form
            <span className="font-normal text-slate-400 ml-1">— {selectedPageName}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Choose a specific form, or capture leads from all forms on this page.
          </p>
        </div>

        {forms.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {/* All forms option */}
            <label className="flex items-center gap-3 px-4 py-3 bg-white border rounded-lg cursor-pointer transition-colors border-primary bg-blue-50/40">
              <input
                type="radio"
                name="form"
                value="all"
                checked={selectedFormId === 'all'}
                onChange={() => { setSelectedFormId('all'); setSelectedFormName(null); }}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">All lead forms</p>
                <p className="text-xs text-slate-400">Capture every lead from this page</p>
              </div>
            </label>

            {(forms.data ?? []).map((form) => (
              <label
                key={form.id}
                className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-lg cursor-pointer transition-colors ${
                  selectedFormId === form.id ? 'border-primary bg-blue-50/40' : 'border-border hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="form"
                  value={form.id}
                  checked={selectedFormId === form.id}
                  onChange={() => { setSelectedFormId(form.id); setSelectedFormName(form.name); }}
                  className="accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{form.name}</p>
                  {form.status && <p className="text-xs text-slate-400 capitalize">{form.status.toLowerCase()}</p>}
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <button
            onClick={() => { setSelectedPageId(null); setInWizard(false); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 border border-border rounded-lg hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <button
            onClick={handleFinish}
            disabled={connect.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {connect.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Connect
          </button>
        </div>
      </div>
    );
  }

  // ── Step: connect ────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center gap-3 py-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
          <Facebook size={28} className="text-blue-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Connect your Facebook Pages</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            Authorize Excess CRM to access your Facebook Pages. You&apos;ll pick which page and lead form to use in the next steps.
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={oauthUrl.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] text-white text-sm font-semibold rounded-lg hover:bg-[#166FE5] disabled:opacity-60 transition-colors"
        >
          {oauthUrl.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Facebook size={16} />
          )}
          Continue with Facebook
        </button>
      </div>
      <p className="text-xs text-center text-slate-400">
        You&apos;ll be redirected to Facebook to authorize access. No ad spend is required.
      </p>
    </div>
  );
}

// ─── Health panel ─────────────────────────────────────────────────────────────

const SOURCE_ICON: Record<string, string> = {
  META: '📱', INDIAMART: '🏭', JUSTDIAL: '📞', WEBSITE: '🌐', MANUAL: '✏️', CSV: '📄',
};

const STATUS_DOT: Record<IntegrationHealthEntry['status'], string> = {
  healthy:  'bg-green-500',
  slow:     'bg-amber-400',
  stale:    'bg-red-500',
  inactive: 'bg-slate-300',
};

const STATUS_LABEL: Record<IntegrationHealthEntry['status'], string> = {
  healthy: 'Healthy', slow: 'Slow', stale: 'Stale', inactive: 'Inactive',
};

function IntegrationHealthPanel() {
  const { data, isLoading } = useIntegrationHealth();
  const health = data?.health ?? [];

  if (isLoading) return <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />;
  if (health.length === 0) return null;

  const healthyCount = health.filter((h) => h.status === 'healthy').length;

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Integration Health</h2>
        <span className="text-xs text-slate-500">
          {healthyCount}/{health.length} healthy · auto-refreshes
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {health.map((h) => (
          <div key={h.sourceId} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
            <span className="text-lg leading-none">{SOURCE_ICON[h.type] ?? '🔌'}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[h.status]}`} />
                <span className="text-xs font-medium text-slate-700 truncate">{h.type}</span>
              </div>
              <p className="text-xs text-slate-500">
                {h.leadsToday} today · {h.leadsThisWeek} this week
              </p>
              {h.lastLeadAt && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Last: {formatDistanceToNow(new Date(h.lastLeadAt), { addSuffix: true })}
                </p>
              )}
              <span className="inline-block mt-1 text-xs text-slate-400">
                {STATUS_LABEL[h.status]}
              </span>
            </div>
          </div>
        ))}
      </div>
      {data && (
        <p className="mt-3 text-xs text-slate-500 text-right">
          Total today: {data.totalLeadsToday} leads · This week: {data.totalLeadsThisWeek}
        </p>
      )}
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
  const configuring = !connected && defn.type === 'META' && !!(source?.config as { hasPendingPages?: boolean })?.hasPendingPages;

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
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
            ) : configuring ? (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                <Loader2 size={12} className="animate-spin" /> Setup in progress
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
          {defn.type === 'META' && <FacebookPanel source={source} />}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: sources, isLoading } = useIntegrations();

  const getSource = (type: IntegrationType) => {
    if (type === 'META') return sources?.find((s) => s.type === type);
    return sources?.find((s) => s.type === type && s.isActive);
  };

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

      {/* Health panel */}
      <IntegrationHealthPanel />

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
