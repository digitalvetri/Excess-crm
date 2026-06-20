import { AlertCircle } from 'lucide-react';

/**
 * Shared stale / SLA indicator used by both the leads table and the kanban board.
 * Hidden while a lead is < 24h in its current stage. Over 72h it reads "Xd stale"
 * in danger red; between 24–72h it reads "Xh" in warning amber.
 */
export function StaleBadge({ stageChangedAt }: { stageChangedAt: string }) {
  const hours = (Date.now() - new Date(stageChangedAt).getTime()) / 3600000;
  if (hours < 24) return null;
  const isRotten = hours > 72;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        isRotten ? 'text-danger bg-red-50' : 'text-warning bg-amber-50'
      }`}
    >
      <AlertCircle size={10} />
      {isRotten ? `${Math.floor(hours / 24)}d stale` : `${Math.floor(hours)}h`}
    </span>
  );
}
