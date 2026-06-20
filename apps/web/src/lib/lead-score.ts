export type ScoreTierColor = 'red' | 'orange' | 'amber' | 'slate';
export type ScoreTierLabel = 'Burning' | 'Hot' | 'Warm' | 'Cold';

export function scoreTier(score: number): { label: ScoreTierLabel; color: ScoreTierColor } {
  if (score >= 76) return { label: 'Burning', color: 'red' };
  if (score >= 51) return { label: 'Hot', color: 'orange' };
  if (score >= 31) return { label: 'Warm', color: 'amber' };
  return { label: 'Cold', color: 'slate' };
}

/**
 * Tailwind classes per tier colour. Full literal strings only — never
 * interpolate colour names into class templates or the v4 scanner drops them.
 */
export const scoreColorClasses: Record<ScoreTierColor, { text: string; bg: string; border: string }> = {
  red: { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  orange: { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  amber: { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  slate: { text: 'text-slate-500', bg: 'bg-slate-100', border: 'border-slate-200' },
};
