'use client';

import { useState } from 'react';
import { Hammer, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  useProjects,
  PROJECT_STAGES,
  STAGE_LABEL,
  SUBSIDY_STATUS_LABEL,
  NM_STATUS_LABEL,
  type ProjectStage,
  type SubsidyStatus,
  type NetMeteringStatus,
} from '@/hooks/use-projects';
import { useEngineers } from '@/hooks/use-service-tickets';
import { ProjectKpiStrip } from '@/components/projects/project-kpi-strip';
import { ProjectCard } from '@/components/projects/project-card';

const SUBSIDY_STATUSES: SubsidyStatus[] = ['NOT_APPLIED', 'APPLIED', 'DISCOM_INSPECTION_SCHEDULED', 'DISCOM_APPROVED', 'PORTAL_UPLOAD_DONE', 'CREDITED'];
const NM_STATUSES: NetMeteringStatus[]  = ['NOT_APPLIED', 'SLD_SUBMITTED', 'LOAD_SANCTION_APPLIED', 'INSPECTION_DONE', 'METER_CHANGED', 'GRID_SYNCED', 'ACTIVE'];

export default function ProjectsPage() {
  const [stageFilter,    setStageFilter]    = useState<ProjectStage | 'ALL'>('ALL');
  const [search,         setSearch]         = useState('');
  const [showFilters,    setShowFilters]    = useState(false);
  const [engineerId,     setEngineerId]     = useState('');
  const [subsidyStatus,  setSubsidyStatus]  = useState<SubsidyStatus | ''>('');
  const [nmStatus,       setNmStatus]       = useState<NetMeteringStatus | ''>('');

  const { data: engineers = [] } = useEngineers();

  const filters: { stage?: string; search?: string; engineerId?: string; subsidyStatus?: string; netMeteringStatus?: string } = {};
  if (stageFilter !== 'ALL')  filters.stage             = stageFilter;
  if (search.trim())          filters.search            = search.trim();
  if (engineerId)             filters.engineerId         = engineerId;
  if (subsidyStatus)          filters.subsidyStatus      = subsidyStatus;
  if (nmStatus)               filters.netMeteringStatus  = nmStatus;

  const activeFilterCount = [engineerId, subsidyStatus, nmStatus].filter(Boolean).length;

  function clearAdvancedFilters() {
    setEngineerId('');
    setSubsidyStatus('');
    setNmStatus('');
  }

  const { data, isLoading, isError } = useProjects(filters);
  const projects = data?.projects ?? [];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Install Projects</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Post-conversion lifecycle — survey through commissioning and handover.
          </p>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <ProjectKpiStrip />

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project no. or customer…"
            className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            showFilters || activeFilterCount > 0
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button onClick={clearAdvancedFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-danger transition-colors">
            <X size={13} /> Clear filters
          </button>
        )}
      </div>

      {/* ── Advanced filter panel ── */}
      {showFilters && (
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Engineer filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Engineer</label>
              <select
                value={engineerId}
                onChange={(e) => setEngineerId(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All engineers</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>

            {/* Subsidy status filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Subsidy Status</label>
              <select
                value={subsidyStatus}
                onChange={(e) => setSubsidyStatus(e.target.value as SubsidyStatus | '')}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Any status</option>
                {SUBSIDY_STATUSES.map((s) => (
                  <option key={s} value={s}>{SUBSIDY_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>

            {/* Net metering status filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Net Metering</label>
              <select
                value={nmStatus}
                onChange={(e) => setNmStatus(e.target.value as NetMeteringStatus | '')}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Any status</option>
                {NM_STATUSES.map((s) => (
                  <option key={s} value={s}>{NM_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage tabs ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {(['ALL', ...PROJECT_STAGES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              stageFilter === s
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white border border-border text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s === 'ALL' ? 'All' : STAGE_LABEL[s]}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-border bg-white" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-white py-16 text-center">
          <p className="text-sm font-medium text-danger">Failed to load projects.</p>
          <p className="mt-1 text-xs text-slate-400">Check your connection and try again.</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-white py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Hammer size={26} className="text-slate-400" />
          </div>
          <p className="text-base font-semibold text-slate-600">No install projects found</p>
          <p className="mt-1 text-sm text-slate-400">
            {search
              ? 'Try a different search term.'
              : activeFilterCount > 0
              ? 'No projects match the selected filters.'
              : stageFilter !== 'ALL'
              ? `No projects in the ${STAGE_LABEL[stageFilter as ProjectStage]} stage.`
              : 'Projects are created automatically when a lead is marked Converted.'}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={clearAdvancedFilters} className="mt-3 text-xs text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
          {data?.hasMore && (
            <p className="text-center text-sm text-slate-400">
              Showing first {projects.length} projects — use search or filters to narrow results.
            </p>
          )}
        </>
      )}
    </div>
  );
}
