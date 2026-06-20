'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const MENU_WIDTH = 176; // w-44

interface Props {
  leadId: string;
  currentStage: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function StageChangeMenu({ leadId, currentStage, anchorRect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { mutate, isPending } = useUpdateLead();
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
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

  // Render in a portal with fixed positioning so the table's overflow-hidden can't
  // clip the dropdown. Right-aligned to the trigger; opens upward if it would run
  // off the bottom of the viewport.
  const ITEM_COUNT = STAGES.filter((s) => s.value !== currentStage).length;
  const estHeight = 36 + ITEM_COUNT * 36; // header + rows
  const openUp = anchorRect.bottom + estHeight > window.innerHeight && anchorRect.top > estHeight;
  const top = openUp ? anchorRect.top - estHeight : anchorRect.bottom + 4;
  const left = Math.max(8, anchorRect.right - MENU_WIDTH);

  const menu = (
    <div
      ref={ref}
      style={{ position: 'fixed', top, left, width: MENU_WIDTH }}
      className="z-50 bg-white border border-border rounded-xl shadow-lg py-1"
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
    </div>
  );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
      {converting && (
        <ConvertLeadModal leadId={leadId} onClose={() => { setConverting(false); onClose(); }} />
      )}
    </>
  );
}
