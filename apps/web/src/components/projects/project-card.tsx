'use client';

import Link from 'next/link';
import { differenceInDays, format } from 'date-fns';
import { Check, AlertTriangle, Clock, Zap, SunMedium, BadgeDollarSign } from 'lucide-react';
import {
  PROJECT_STAGES,
  STAGE_LABEL,
  SUBSIDY_SCHEME_LABEL,
  SUBSIDY_STATUS_LABEL,
  NM_STATUS_LABEL,
  type ProjectListItem,
  type ProjectStage,
  type SubsidyScheme,
  type SubsidyStatus,
  type NetMeteringStatus,
} from '@/hooks/use-projects';

// ── SLA thresholds (days in stage before at-risk / overdue) ──────────────────
const SLA: Record<ProjectStage, { atRisk: number; overdue: number }> = {
  SURVEY:           { atRisk: 3,  overdue: 7  },
  DESIGN:           { atRisk: 5,  overdue: 14 },
  MATERIAL_ORDERED: { atRisk: 7,  overdue: 21 },
  INSTALLATION:     { atRisk: 14, overdue: 30 },
  COMMISSIONING:    { atRisk: 3,  overdue: 7  },
  HANDED_OVER:      { atRisk: 999, overdue: 999 },
};

type SlaHealth = 'on-track' | 'at-risk' | 'overdue' | 'done';

function getSlaHealth(stage: ProjectStage, stageChangedAt: string): SlaHealth {
  if (stage === 'HANDED_OVER') return 'done';
  const days = differenceInDays(new Date(), new Date(stageChangedAt));
  const { atRisk, overdue } = SLA[stage];
  if (days >= overdue) return 'overdue';
  if (days >= atRisk) return 'at-risk';
  return 'on-track';
}

const SLA_CHIP: Record<SlaHealth, { label: string; cls: string }> = {
  'on-track': { label: 'On Track', cls: 'bg-success/10 text-success' },
  'at-risk':  { label: 'At Risk',  cls: 'bg-amber-100 text-amber-700' },
  'overdue':  { label: 'Overdue',  cls: 'bg-danger/10 text-danger' },
  'done':     { label: 'Complete', cls: 'bg-green-100 text-green-700' },
};

const STAGE_BADGE: Record<ProjectStage, string> = {
  SURVEY:           'bg-slate-100 text-slate-700',
  DESIGN:           'bg-blue-100 text-blue-700',
  MATERIAL_ORDERED: 'bg-amber-100 text-amber-700',
  INSTALLATION:     'bg-indigo-100 text-indigo-700',
  COMMISSIONING:    'bg-cyan-100 text-cyan-700',
  HANDED_OVER:      'bg-green-100 text-green-700',
};

const SUBSIDY_STATUS_COLOR: Partial<Record<SubsidyStatus, string>> = {
  NOT_APPLIED:                 'text-slate-400',
  APPLIED:                     'text-blue-600',
  DISCOM_INSPECTION_SCHEDULED: 'text-amber-600',
  DISCOM_APPROVED:             'text-indigo-600',
  PORTAL_UPLOAD_DONE:          'text-cyan-600',
  CREDITED:                    'text-success',
};

const NM_STATUS_COLOR: Partial<Record<NetMeteringStatus, string>> = {
  NOT_APPLIED:           'text-slate-400',
  SLD_SUBMITTED:         'text-blue-600',
  LOAD_SANCTION_APPLIED: 'text-amber-600',
  INSPECTION_DONE:       'text-indigo-600',
  METER_CHANGED:         'text-cyan-600',
  GRID_SYNCED:           'text-violet-600',
  ACTIVE:                'text-success',
};

// ── Component ─────────────────────────────────────────────────────────────────
export function ProjectCard({ project }: { project: ProjectListItem }) {
  const stageIdx   = PROJECT_STAGES.indexOf(project.stage);
  const slaHealth  = getSlaHealth(project.stage, project.stageChangedAt);
  const slaChip    = SLA_CHIP[slaHealth];
  const daysInStage = differenceInDays(new Date(), new Date(project.stageChangedAt));

  const totalValue = parseFloat(project.totalValueInr) || 0;
  const collected  = project.payments.reduce((sum, p) => sum + parseFloat(p.amountInr), 0);
  const payPct     = totalValue > 0 ? Math.min((collected / totalValue) * 100, 100) : 0;

  const hasSubsidy = project.subsidyScheme !== 'NONE';

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-2xl border border-border bg-white hover:border-primary/30 hover:shadow-md transition-all"
    >
      {/* ── Top bar ── */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-primary">{project.number}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STAGE_BADGE[project.stage]}`}>
              {STAGE_LABEL[project.stage]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${slaChip.cls}`}>
              {slaHealth !== 'done' && (
                slaHealth === 'overdue' ? <AlertTriangle size={9} className="inline mr-0.5" /> :
                slaHealth === 'at-risk' ? <Clock size={9} className="inline mr-0.5" /> : null
              )}
              {slaHealth === 'done' ? <Check size={9} className="inline mr-0.5" /> : null}
              {slaChip.label}
              {slaHealth !== 'done' && <span className="ml-0.5 opacity-70">· {daysInStage}d</span>}
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-800 truncate">{project.lead.name}</div>
          <div className="text-xs text-slate-400">
            {project.lead.phone}
            {project.lead.city ? ` · ${project.lead.city}` : ''}
            {' · '}
            <span className="text-slate-400">
              {format(new Date(project.createdAt), 'd MMM yyyy')}
            </span>
          </div>
        </div>

        {/* System kW badge */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 rounded-xl bg-primary/8 px-2.5 py-1">
            <SunMedium size={13} className="text-primary" />
            <span className="text-sm font-bold text-primary">
              {parseFloat(project.systemKw).toLocaleString('en-IN')} kW
            </span>
          </div>
          <span className="text-xs text-slate-500">
            ₹{(totalValue / 100000).toFixed(1)}L
          </span>
        </div>
      </div>

      {/* ── Stage progress stepper ── */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-0">
          {PROJECT_STAGES.map((s, idx) => {
            const done    = idx < stageIdx;
            const current = idx === stageIdx;
            const isLast  = idx === PROJECT_STAGES.length - 1;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    done    ? 'bg-success text-white' :
                    current ? 'bg-primary text-white ring-2 ring-primary/20' :
                              'bg-slate-100 text-slate-300'
                  }`}
                >
                  {done ? <Check size={10} /> : (
                    <span className="text-[9px] font-bold">{idx + 1}</span>
                  )}
                </div>
                {!isLast && (
                  <div className={`flex-1 h-0.5 ${idx < stageIdx ? 'bg-success' : 'bg-slate-100'}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex mt-1">
          {PROJECT_STAGES.map((s, idx) => {
            const isLast = idx === PROJECT_STAGES.length - 1;
            return (
              <div key={s} className={`flex-1 ${isLast ? 'flex-none' : ''}`}>
                <span className={`text-[9px] font-medium ${idx === stageIdx ? 'text-primary' : 'text-slate-300'}`}>
                  {STAGE_LABEL[s].split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Payment progress ── */}
      {totalValue > 0 && (
        <div className="px-5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <BadgeDollarSign size={11} />
              <span>
                ₹{(collected / 100000).toFixed(1)}L of ₹{(totalValue / 100000).toFixed(1)}L collected
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-600">{Math.round(payPct)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${payPct >= 100 ? 'bg-success' : payPct >= 60 ? 'bg-primary' : 'bg-amber-400'}`}
              style={{ width: `${payPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Status chips row ── */}
      {(hasSubsidy || project.netMeteringStatus) && (
        <div className="flex items-center gap-2 flex-wrap border-t border-border/60 px-5 py-2.5">
          {hasSubsidy && (
            <div className="flex items-center gap-1">
              <Zap size={11} className="text-amber-500 shrink-0" />
              <span className="text-[11px] text-slate-500">
                {SUBSIDY_SCHEME_LABEL[project.subsidyScheme as SubsidyScheme]}:
              </span>
              <span className={`text-[11px] font-semibold ${project.subsidyStatus ? SUBSIDY_STATUS_COLOR[project.subsidyStatus] : 'text-slate-400'}`}>
                {project.subsidyStatus ? SUBSIDY_STATUS_LABEL[project.subsidyStatus] : 'Not applied'}
              </span>
            </div>
          )}
          {project.netMeteringStatus && project.netMeteringStatus !== 'NOT_APPLIED' && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400">·</span>
              <span className="text-[11px] text-slate-500">Net Metering:</span>
              <span className={`text-[11px] font-semibold ${NM_STATUS_COLOR[project.netMeteringStatus]}`}>
                {NM_STATUS_LABEL[project.netMeteringStatus]}
              </span>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
