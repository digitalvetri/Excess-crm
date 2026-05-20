'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Hammer, Search } from 'lucide-react';
import {
  useProjects,
  PROJECT_STAGES,
  STAGE_LABEL,
  type ProjectStage,
} from '@/hooks/use-projects';

const STAGE_BADGE: Record<ProjectStage, string> = {
  SURVEY: 'bg-slate-100 text-slate-700',
  DESIGN: 'bg-blue-100 text-blue-700',
  MATERIAL_ORDERED: 'bg-amber-100 text-amber-700',
  INSTALLATION: 'bg-indigo-100 text-indigo-700',
  COMMISSIONING: 'bg-cyan-100 text-cyan-700',
  HANDED_OVER: 'bg-green-100 text-green-700',
};

export default function ProjectsPage() {
  const [stageFilter, setStageFilter] = useState<ProjectStage | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const filters: { stage?: string; search?: string } = {};
  if (stageFilter !== 'ALL') filters.stage = stageFilter;
  if (search.trim()) filters.search = search.trim();

  const { data, isLoading, isError } = useProjects(filters);
  const projects = data?.projects ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Install Projects</h1>
          <p className="text-sm text-slate-500 mt-1">
            Post-conversion lifecycle — survey through commissioning and handover.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project no. or customer…"
            className="text-sm border border-border rounded-lg pl-9 pr-3 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['ALL', ...PROJECT_STAGES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                stageFilter === s
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'ALL' ? 'All' : STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-danger text-sm">Failed to load projects. Please refresh.</p>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <Hammer size={26} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No install projects yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Projects are created automatically when a lead is marked Converted.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                {['Project No.', 'Customer', 'System (kW)', 'Value (₹)', 'Stage', 'Updated'].map((col) => (
                  <th key={col} className="px-4 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/projects/${p.id}`} className="text-primary font-medium hover:underline">
                      {p.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{p.lead.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.lead.phone}
                      {p.lead.city ? ` · ${p.lead.city}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    {parseFloat(p.systemKw).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    ₹{parseFloat(p.totalValueInr).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STAGE_BADGE[p.stage]}`}
                    >
                      {STAGE_LABEL[p.stage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    {new Date(p.stageChangedAt).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
