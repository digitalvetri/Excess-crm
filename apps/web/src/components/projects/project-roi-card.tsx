'use client';

import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, Leaf, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import type { GenerationReading } from '@/hooks/use-projects';

const CO2_KG_PER_KWH = 0.82;       // India grid emission factor
const PEAK_SUN_HOURS = 4.5;         // Tamil Nadu average
const PANEL_LIFE_YEARS = 25;
const DEGRADATION_PER_YEAR = 0.005; // 0.5% per year

interface RoiData {
  paybackYears: number | null;
  savingsToDate: number;
  co2KgToDate: number;
  projectedAnnualSavings: number;
  projectedLifetimeSavings: number;
  breakEvenYear: number | null;
}

function calcRoi(
  systemKw: number,
  totalValueInr: number,
  tariffInr: number,
  readings: GenerationReading[],
): RoiData {
  const totalKwh   = readings.reduce((s, r) => s + r.kwhGenerated, 0);
  const months     = readings.length;
  const savingsToDate = totalKwh * tariffInr;
  const co2KgToDate   = totalKwh * CO2_KG_PER_KWH;

  // Projected annual: use actual average if ≥ 6 months, else use system capacity
  const annualKwh =
    months >= 6
      ? (totalKwh / months) * 12
      : systemKw * PEAK_SUN_HOURS * 365;

  const projectedAnnualSavings  = annualKwh * tariffInr;
  const projectedLifetimeSavings = Array.from({ length: PANEL_LIFE_YEARS }, (_, i) =>
    annualKwh * Math.pow(1 - DEGRADATION_PER_YEAR, i) * tariffInr,
  ).reduce((s, v) => s + v, 0);

  const paybackYears =
    projectedAnnualSavings > 0 ? totalValueInr / projectedAnnualSavings : null;

  const breakEvenYear =
    paybackYears !== null ? Math.ceil(paybackYears) : null;

  return {
    paybackYears,
    savingsToDate,
    co2KgToDate,
    projectedAnnualSavings,
    projectedLifetimeSavings,
    breakEvenYear,
  };
}

function buildCumulativeCurve(
  totalValueInr: number,
  annualSavings: number,
  commissionedAt: string | null,
): { year: string; savings: number; investment: number }[] {
  const startYear = commissionedAt ? new Date(commissionedAt).getFullYear() : new Date().getFullYear();
  return Array.from({ length: PANEL_LIFE_YEARS + 1 }, (_, i) => ({
    year: String(startYear + i),
    savings: Math.round(annualSavings * i),
    investment: totalValueInr,
  }));
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ProjectRoiCard({
  systemKw,
  totalValueInr,
  commissionedAt,
  generationLog,
  isPostCommission,
}: {
  systemKw: string;
  totalValueInr: string;
  commissionedAt: string | null;
  generationLog: GenerationReading[];
  isPostCommission: boolean;
}) {
  const [tariff, setTariff] = useState(6.5);
  const [editTariff, setEditTariff] = useState(false);
  const [tariffDraft, setTariffDraft] = useState('6.5');

  const kw    = parseFloat(systemKw) || 0;
  const value = parseFloat(totalValueInr) || 0;

  const roi = calcRoi(kw, value, tariff, generationLog);

  const curve = buildCumulativeCurve(value, roi.projectedAnnualSavings, commissionedAt);

  const co2Tonnes = roi.co2KgToDate / 1000;
  const treesEq   = Math.round(roi.co2KgToDate / 21);

  if (!isPostCommission && generationLog.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-5 flex flex-col items-center justify-center py-10 text-center">
        <TrendingUp size={28} className="text-slate-200 mb-2" />
        <p className="text-sm text-slate-400">ROI calculator available after commissioning</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <TrendingUp size={15} className="text-success" />
          <h3 className="text-sm font-semibold text-slate-700">ROI Tracker</h3>
        </div>

        {/* Tariff editor */}
        <div className="flex items-center gap-1.5">
          {editTariff ? (
            <>
              <span className="text-xs text-slate-400">₹</span>
              <input
                type="number"
                min={1}
                step={0.5}
                value={tariffDraft}
                onChange={(e) => setTariffDraft(e.target.value)}
                className="w-16 rounded-lg border border-primary/30 bg-white px-2 py-1 text-xs focus:outline-none"
                autoFocus
              />
              <span className="text-xs text-slate-400">/kWh</span>
              <button
                onClick={() => {
                  const t = parseFloat(tariffDraft);
                  if (!isNaN(t) && t > 0) setTariff(t);
                  setEditTariff(false);
                }}
                className="text-xs text-primary font-semibold"
              >
                OK
              </button>
            </>
          ) : (
            <button
              onClick={() => { setTariffDraft(String(tariff)); setEditTariff(true); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              Tariff: ₹{tariff}/kWh
              <Edit2 size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3">
          <RoiChip
            label="Savings to Date"
            value={`₹${Math.round(roi.savingsToDate).toLocaleString('en-IN')}`}
            sub={generationLog.length > 0 ? `from ${generationLog.length} months` : 'based on projection'}
            color="text-success"
            bg="bg-success/8"
          />
          <RoiChip
            label="Payback Period"
            value={roi.paybackYears !== null ? `${roi.paybackYears.toFixed(1)} yrs` : '—'}
            sub={roi.breakEvenYear ? `Break-even: ${roi.breakEvenYear < new Date().getFullYear() ? 'achieved ✓' : roi.breakEvenYear}` : '—'}
            color={roi.paybackYears && roi.paybackYears < 6 ? 'text-success' : 'text-amber-600'}
            bg={roi.paybackYears && roi.paybackYears < 6 ? 'bg-success/8' : 'bg-amber-50'}
          />
          <RoiChip
            label="Annual Savings"
            value={`₹${Math.round(roi.projectedAnnualSavings).toLocaleString('en-IN')}`}
            sub={`at ₹${tariff}/kWh tariff`}
            color="text-primary"
            bg="bg-primary/5"
          />
          <RoiChip
            label="Lifetime Savings"
            value={`₹${(roi.projectedLifetimeSavings / 100000).toFixed(1)}L`}
            sub={`over ${PANEL_LIFE_YEARS} years`}
            color="text-slate-700"
            bg="bg-slate-50"
          />
        </div>

        {/* CO2 impact */}
        {roi.co2KgToDate > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3">
            <Leaf size={18} className="text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">
                {co2Tonnes >= 1
                  ? `${co2Tonnes.toFixed(2)} tonnes CO₂ offset`
                  : `${Math.round(roi.co2KgToDate)} kg CO₂ offset`}
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Equivalent to planting {treesEq.toLocaleString('en-IN')} tree{treesEq !== 1 ? 's' : ''}
              </p>
            </div>
            {commissionedAt && (
              <div className="text-xs text-emerald-500 shrink-0 text-right">
                Since<br />{format(new Date(commissionedAt), 'd MMM yyyy')}
              </div>
            )}
          </div>
        )}

        {/* Cumulative savings chart */}
        {value > 0 && roi.projectedAnnualSavings > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Cumulative Savings vs. Investment
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={curve} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#27AE60" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#27AE60" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v >= 100000 ? `₹${(v / 100000).toFixed(0)}L` : `₹${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: 12 }}
                  formatter={(v: number, name: string) => [
                    `₹${v.toLocaleString('en-IN')}`,
                    name === 'savings' ? 'Cumulative Savings' : 'Total Investment',
                  ]}
                />
                {roi.breakEvenYear && (
                  <ReferenceLine
                    x={String(roi.breakEvenYear)}
                    stroke="#27AE60"
                    strokeDasharray="4 4"
                    label={{ value: 'Break-even', position: 'top', fontSize: 10, fill: '#27AE60' }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="investment"
                  stroke="#F39C12"
                  strokeWidth={1.5}
                  fill="none"
                  dot={false}
                  strokeDasharray="4 4"
                />
                <Area
                  type="monotone"
                  dataKey="savings"
                  stroke="#27AE60"
                  strokeWidth={2}
                  fill="url(#savingsGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1">
              <LegendDot color="bg-success" label="Cumulative savings" />
              <LegendDot color="bg-amber-400" label="Investment" dashed />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function RoiChip({
  label, value, sub, color, bg,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <div className="text-[11px] text-slate-400 font-medium mb-1">{label}</div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

function LegendDot({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-4 rounded-full ${color} ${dashed ? 'opacity-60' : ''}`} />
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}
