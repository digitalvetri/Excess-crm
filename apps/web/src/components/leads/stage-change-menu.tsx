'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUpdateLead } from '@/hooks/use-leads';
import { ConvertLeadModal } from './convert-lead-modal';

const STAGES = [
  { value: 'NEW', label: 'New' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'NOT_ANSWERED', label: 'Not Answered' },
  { value: 'INVALID', label: 'Invalid' },
  { value: 'WRONG_ENQUIRY', label: 'Wrong Enquiry' },
];

interface Props {
  leadId: string;
  currentStage: string;
  onClose: () => void;
}

export function StageChangeMenu({ leadId, currentStage, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { mutate, isPending } = useUpdateLead();
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  function changeStage(stage: string) {
    mutate(
      { id: leadId, data: { stage } },
      {
        onSuccess: () => {
          toast.success(`Stage changed to ${stage.replace('_', ' ')}`);
          onClose();
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
          if (axiosErr.response?.data?.error?.code === 'stage_gate.blocked') {
            toast.error(axiosErr.response.data.error.message ?? 'Stage gate blocked this transition');
          } else {
            toast.error('Failed to update stage');
          }
        },
      },
    );
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-20 bg-white border border-border rounded-xl shadow-lg py-1 w-44"
    >
      <p className="px-3 py-1.5 text-xs font-medium text-slate-400 uppercase tracking-wide">Change stage</p>
      {STAGES.filter((s) => s.value !== currentStage).map((s) => (
        <button
          key={s.value}
          disabled={isPending}
          // Converting needs the system size (kW) for the commission — open the modal.
          onClick={() => (s.value === 'CONVERTED' ? setConverting(true) : changeStage(s.value))}
          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {s.label}
        </button>
      ))}
      {converting && (
        <ConvertLeadModal leadId={leadId} onClose={() => { setConverting(false); onClose(); }} />
      )}
    </div>
  );
}
