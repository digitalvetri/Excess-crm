const STAGE_CONFIG: Record<string, { label: string; className: string }> = {
  NEW: { label: 'New', className: 'bg-blue-100 text-blue-700' },
  QUALIFIED: { label: 'Qualified', className: 'bg-green-100 text-green-700' },
  FOLLOW_UP: { label: 'Follow Up', className: 'bg-yellow-100 text-yellow-700' },
  CONVERTED: { label: 'Converted', className: 'bg-emerald-100 text-emerald-700' },
  NOT_ANSWERED: { label: 'Not Answered', className: 'bg-slate-100 text-slate-600' },
  INVALID: { label: 'Invalid', className: 'bg-red-100 text-red-700' },
  WRONG_ENQUIRY: { label: 'Wrong Enquiry', className: 'bg-orange-100 text-orange-700' },
};

export function StageBadge({ stage }: { stage: string }) {
  const cfg = STAGE_CONFIG[stage] ?? { label: stage, className: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
