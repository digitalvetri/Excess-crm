'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight, Building2, MapPin, User, Percent, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useOnboardFranchise,
  type FranchiseTier,
  type FranchiseAgentRole,
} from '@/hooks/use-franchise';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Step1Data {
  name: string;
  tier: FranchiseTier;
  state: string;
  city: string;
  district: string;
  pinCodes: string;
}

interface Step2Data {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  gstNumber: string;
  bankHolderName: string;
  bankAccountNumber: string;
  bankIfsc: string;
}

interface Step3Data {
  commissionRate: number;
  ownerSplit: number;
  salesSplit: number;
  surveySplit: number;
  followupSplit: number;
}

const TIERS: FranchiseTier[] = ['BRONZE', 'SILVER', 'GOLD'];

const TIER_COLORS: Record<FranchiseTier, string> = {
  BRONZE: 'bg-amber-700 text-white border-amber-700',
  SILVER: 'bg-slate-400 text-white border-slate-400',
  GOLD:   'bg-yellow-500 text-white border-yellow-500',
};

const TIER_OUTLINE: Record<FranchiseTier, string> = {
  BRONZE: 'border-amber-700 text-amber-700',
  SILVER: 'border-slate-400 text-slate-500',
  GOLD:   'border-yellow-500 text-yellow-600',
};

const STEP_ICONS = [MapPin, User, Percent, CheckCircle2];
const STEP_LABELS = ['Territory', 'Owner', 'Commission', 'Review'];

const AGENT_ROLES: { role: FranchiseAgentRole; label: string }[] = [
  { role: 'OWNER',   label: 'Owner'     },
  { role: 'SALES',   label: 'Sales'     },
  { role: 'SURVEY',  label: 'Survey'    },
  { role: 'FOLLOWUP',label: 'Follow-up' },
];

function parsePinCodes(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isStep1Valid(d: Step1Data): boolean {
  return (
    d.name.trim().length >= 2 &&
    d.state.trim().length > 0 &&
    d.city.trim().length > 0 &&
    parsePinCodes(d.pinCodes).length > 0
  );
}

function isStep2Valid(d: Step2Data): boolean {
  return (
    d.contactName.trim().length > 0 &&
    d.contactEmail.trim().length > 0 &&
    d.contactPhone.trim().length > 0
  );
}

export function OnboardFranchiseWizard({ open, onClose }: Props) {
  const [step, setStep]             = useState(0);
  const [launched, setLaunched]     = useState(false);
  const [inviteSucceeded, setInviteSucceeded] = useState(false);

  const [step1, setStep1] = useState<Step1Data>({
    name: '', tier: 'BRONZE', state: '', city: '', district: '', pinCodes: '',
  });

  const [step2, setStep2] = useState<Step2Data>({
    contactName: '', contactEmail: '', contactPhone: '',
    gstNumber: '', bankHolderName: '', bankAccountNumber: '', bankIfsc: '',
  });

  const [step3, setStep3] = useState<Step3Data>({
    commissionRate: 5,
    ownerSplit: 40, salesSplit: 30, surveySplit: 20, followupSplit: 10,
  });

  const onboard = useOnboardFranchise();
  const qc      = useQueryClient();

  useEffect(() => {
    if (!open) {
      setStep(0);
      setLaunched(false);
      setInviteSucceeded(false);
      setStep1({ name: '', tier: 'BRONZE', state: '', city: '', district: '', pinCodes: '' });
      setStep2({ contactName: '', contactEmail: '', contactPhone: '', gstNumber: '', bankHolderName: '', bankAccountNumber: '', bankIfsc: '' });
      setStep3({ commissionRate: 5, ownerSplit: 40, salesSplit: 30, surveySplit: 20, followupSplit: 10 });
    }
  }, [open]);

  if (!open) return null;

  const splitTotal = step3.ownerSplit + step3.salesSplit + step3.surveySplit + step3.followupSplit;
  const splitOk    = splitTotal === 100;

  const splitValue = (role: FranchiseAgentRole): number => {
    if (role === 'OWNER')   return step3.ownerSplit;
    if (role === 'SALES')   return step3.salesSplit;
    if (role === 'SURVEY')  return step3.surveySplit;
    return step3.followupSplit;
  };

  const setSplitValue = (role: FranchiseAgentRole, val: number) => {
    if (role === 'OWNER')    setStep3((s) => ({ ...s, ownerSplit:   val }));
    else if (role === 'SALES')    setStep3((s) => ({ ...s, salesSplit:   val }));
    else if (role === 'SURVEY')   setStep3((s) => ({ ...s, surveySplit:  val }));
    else                          setStep3((s) => ({ ...s, followupSplit: val }));
  };

  const handleNext = () => {
    if (step === 0 && !isStep1Valid(step1)) {
      toast.error('Please fill in all required territory fields.');
      return;
    }
    if (step === 1 && !isStep2Valid(step2)) {
      toast.error('Owner name, email and phone are required.');
      return;
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => s - 1);

  const handleLaunch = async () => {
    const bankAccount: Record<string, string> = {};
    if (step2.bankHolderName)    bankAccount['holderName']    = step2.bankHolderName;
    if (step2.bankAccountNumber) bankAccount['accountNumber'] = step2.bankAccountNumber;
    if (step2.bankIfsc)          bankAccount['ifsc']          = step2.bankIfsc;

    const agentSplitConfig: Record<string, number> = {
      OWNER:    step3.ownerSplit,
      SALES:    step3.salesSplit,
      SURVEY:   step3.surveySplit,
      FOLLOWUP: step3.followupSplit,
    };

    let franchiseId: string;
    try {
      const result = await onboard.mutateAsync({
        name:         step1.name.trim(),
        tier:         step1.tier,
        contactName:  step2.contactName.trim(),
        contactEmail: step2.contactEmail.trim(),
        contactPhone: step2.contactPhone.trim(),
        ...(step2.gstNumber.trim() && { gstNumber: step2.gstNumber.trim() }),
        territory: {
          state:    step1.state.trim(),
          city:     step1.city.trim(),
          ...(step1.district.trim() && { district: step1.district.trim() }),
          pinCodes: parsePinCodes(step1.pinCodes),
        },
        commissionSlabs: { default: step3.commissionRate },
        agentSplitConfig,
        ...(Object.keys(bankAccount).length > 0 && { bankAccount }),
      });
      franchiseId = result.id;
    } catch {
      toast.error('Failed to create franchise. Please try again.');
      return;
    }

    try {
      await api.post(`/franchise/${franchiseId}/agents/invite`, {
        name:      step2.contactName.trim(),
        email:     step2.contactEmail.trim(),
        agentRole: 'OWNER' satisfies FranchiseAgentRole,
      });
      void qc.invalidateQueries({ queryKey: ['franchise-agents', franchiseId] });
      setInviteSucceeded(true);
    } catch {
      toast.error('Franchise created but invite failed. Please invite the owner manually.');
    }

    setLaunched(true);
    setTimeout(() => onClose(), 2000);
  };

  const isLaunching = onboard.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-slate-800">Onboard Franchise Partner</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center gap-0">
            {STEP_LABELS.map((label, i) => {
              const Icon      = STEP_ICONS[i]!;
              const isActive  = i === step;
              const isDone    = i < step;
              return (
                <div key={label} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={[
                        'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors',
                        isActive ? 'bg-primary border-primary text-white' :
                        isDone   ? 'bg-primary/10 border-primary text-primary' :
                                   'bg-slate-100 border-slate-200 text-slate-400',
                      ].join(' ')}
                    >
                      <Icon size={14} />
                    </div>
                    <span
                      className={[
                        'text-[10px] font-medium',
                        isActive ? 'text-primary' : isDone ? 'text-primary/80' : 'text-slate-400',
                      ].join(' ')}
                    >
                      {label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div
                      className={[
                        'flex-1 h-0.5 mb-4 mx-1 transition-colors',
                        i < step ? 'bg-primary' : 'bg-slate-200',
                      ].join(' ')}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {launched ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-3 text-center">
            <p className="text-3xl">🎉</p>
            <p className="text-base font-semibold text-slate-800">
              Franchise {step1.name} is live in {step1.city}!
            </p>
            {inviteSucceeded && (
              <p className="text-sm text-slate-500">Invite sent to {step2.contactEmail}</p>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

            {step === 0 && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Franchise Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={step1.name}
                    onChange={(e) => setStep1((s) => ({ ...s, name: e.target.value }))}
                    placeholder="e.g. Coimbatore Solar Solutions"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">Tier</label>
                  <div className="flex gap-2">
                    {TIERS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setStep1((s) => ({ ...s, tier: t }))}
                        className={[
                          'flex-1 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors',
                          step1.tier === t ? TIER_COLORS[t] : `bg-white ${TIER_OUTLINE[t]}`,
                        ].join(' ')}
                      >
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={step1.state}
                      onChange={(e) => setStep1((s) => ({ ...s, state: e.target.value }))}
                      placeholder="Tamil Nadu"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={step1.city}
                      onChange={(e) => setStep1((s) => ({ ...s, city: e.target.value }))}
                      placeholder="Coimbatore"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">District</label>
                  <input
                    value={step1.district}
                    onChange={(e) => setStep1((s) => ({ ...s, district: e.target.value }))}
                    placeholder="Coimbatore (optional)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pin Codes <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={step1.pinCodes}
                    onChange={(e) => setStep1((s) => ({ ...s, pinCodes: e.target.value }))}
                    placeholder="641001, 641002, 641003"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                  {step1.pinCodes.trim() && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {parsePinCodes(step1.pinCodes).length} pin code(s) detected
                    </p>
                  )}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Owner Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={step2.contactName}
                    onChange={(e) => setStep2((s) => ({ ...s, contactName: e.target.value }))}
                    placeholder="Ravi Kumar"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={step2.contactEmail}
                      onChange={(e) => setStep2((s) => ({ ...s, contactEmail: e.target.value }))}
                      placeholder="ravi@example.com"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={step2.contactPhone}
                      onChange={(e) => setStep2((s) => ({ ...s, contactPhone: e.target.value }))}
                      placeholder="+91 98765 43210"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">GST Number</label>
                  <input
                    value={step2.gstNumber}
                    onChange={(e) => setStep2((s) => ({ ...s, gstNumber: e.target.value.toUpperCase() }))}
                    placeholder="22AAAAA0000A1Z5 (optional)"
                    maxLength={15}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="pt-1">
                  <p className="text-xs font-semibold text-slate-600 mb-3">Bank Account (optional)</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Account Holder Name</label>
                      <input
                        value={step2.bankHolderName}
                        onChange={(e) => setStep2((s) => ({ ...s, bankHolderName: e.target.value }))}
                        placeholder="Ravi Kumar"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Account Number</label>
                        <input
                          value={step2.bankAccountNumber}
                          onChange={(e) => setStep2((s) => ({ ...s, bankAccountNumber: e.target.value }))}
                          placeholder="0123456789"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">IFSC Code</label>
                        <input
                          value={step2.bankIfsc}
                          onChange={(e) => setStep2((s) => ({ ...s, bankIfsc: e.target.value.toUpperCase() }))}
                          placeholder="SBIN0001234"
                          maxLength={11}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={step3.commissionRate}
                    onChange={(e) => setStep3((s) => ({ ...s, commissionRate: Math.min(30, Math.max(0, Number(e.target.value))) }))}
                    className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Franchise earns {step3.commissionRate}% on each closed deal
                  </p>
                </div>

                <div className="pt-1">
                  <p className="text-xs font-semibold text-slate-600 mb-1">Agent Split Config</p>
                  <p className="text-[11px] text-slate-500 mb-3">
                    These splits determine how each agent earns from a closed deal
                  </p>
                  <div className="space-y-3">
                    {AGENT_ROLES.map(({ role, label }) => (
                      <div key={role} className="flex items-center gap-3">
                        <span className="text-sm text-slate-700 w-20 shrink-0">{label}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={splitValue(role)}
                          onChange={(e) => setSplitValue(role, Math.min(100, Math.max(0, Number(e.target.value))))}
                          className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    ))}
                  </div>
                  <div
                    className={[
                      'mt-3 px-3 py-2 rounded-lg text-xs font-medium',
                      splitOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                    ].join(' ')}
                  >
                    Total: {splitTotal}%{!splitOk && ' — splits must add up to 100%'}
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Territory</p>
                    <p className="text-sm font-semibold text-slate-800">{step1.name}</p>
                    <p className="text-xs text-slate-500">{step1.city}, {step1.state}</p>
                    {step1.district && <p className="text-xs text-slate-500">District: {step1.district}</p>}
                    <p className="text-xs text-slate-500">{parsePinCodes(step1.pinCodes).length} pin code(s)</p>
                    <span
                      className={[
                        'inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
                        step1.tier === 'GOLD'   ? 'bg-yellow-100 text-yellow-700' :
                        step1.tier === 'SILVER' ? 'bg-slate-200 text-slate-600'  :
                                                   'bg-amber-100 text-amber-700',
                      ].join(' ')}
                    >
                      {step1.tier}
                    </span>
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Owner</p>
                    <p className="text-sm font-semibold text-slate-800">{step2.contactName}</p>
                    <p className="text-xs text-slate-500">{step2.contactEmail}</p>
                    <p className="text-xs text-slate-500">{step2.contactPhone}</p>
                    {step2.gstNumber && <p className="text-xs font-mono text-slate-500">GST: {step2.gstNumber}</p>}
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Commission</p>
                    <p className="text-xs text-slate-700">
                      Franchise rate: <span className="font-semibold">{step3.commissionRate}%</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {AGENT_ROLES.map(({ role, label }) => (
                        <span key={role} className="text-[10px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                          {label}: {splitValue(role)}%
                        </span>
                      ))}
                    </div>
                    {!splitOk && (
                      <p className="text-xs text-amber-600 mt-1.5">
                        Agent splits total {splitTotal}% — fix before launching
                      </p>
                    )}
                  </div>
                </div>

                {onboard.isError && (
                  <p className="text-xs text-red-500">Failed to create franchise. Please try again.</p>
                )}
              </div>
            )}

          </div>
        )}

        {!launched && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white rounded-b-2xl">
            <button
              type="button"
              onClick={step === 0 ? onClose : handleBack}
              className="px-4 py-2 border border-slate-200 text-sm font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              {step === 0 ? (
                'Cancel'
              ) : (
                <>
                  <ChevronLeft size={14} />
                  Back
                </>
              )}
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5"
              >
                Next
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLaunch}
                disabled={isLaunching || !splitOk}
                className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLaunching ? 'Launching…' : 'Create Franchise & Send Invite'}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
