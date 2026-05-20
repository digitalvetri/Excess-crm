'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type SequenceTrigger = 'LEAD_STAGE' | 'PROJECT_STAGE' | 'MANUAL';
export type StepChannel = 'WHATSAPP' | 'EMAIL';

export interface SequenceListItem {
  id: string;
  name: string;
  trigger: SequenceTrigger;
  triggerValue: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { steps: number; enrollments: number };
}

export interface SequenceStepInput {
  channel: StepChannel;
  templateName: string;
  params: Record<string, string>;
  delayHours: number;
}

export interface CreateSequenceInput {
  name: string;
  trigger: SequenceTrigger;
  triggerValue?: string;
  steps: SequenceStepInput[];
}

export function useSequences() {
  return useQuery({
    queryKey: ['sequences'],
    queryFn: () => api.get<{ data: SequenceListItem[] }>('/sequences').then((r) => r.data.data),
  });
}

export function useCreateSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSequenceInput) => api.post('/sequences', data).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sequences'] }),
  });
}

export function useToggleSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/sequences/${id}`, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sequences'] }),
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sequences/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sequences'] }),
  });
}
