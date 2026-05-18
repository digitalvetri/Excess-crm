'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  stage: string;
  sourceType: string;
  aiScore: number | null;
  ownerUserId: string | null;
  createdAt: string;
  stageChangedAt: string;
  scheduledAt: string | null;
}

interface LeadsResponse {
  data: {
    leads: Lead[];
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export function useLeads() {
  const searchParams = useSearchParams();
  const filters = Object.fromEntries(searchParams.entries());

  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () =>
      api.get<LeadsResponse>('/leads', { params: filters }).then((r) => r.data.data),
  });
}

export function useLeadDetail(id: string) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => api.get<{ data: Lead }>(`/leads/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/leads/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useAssignLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      api.patch(`/leads/${id}/assign`, { userId }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useBulkAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { action: string; ids: string[]; value: string }) =>
      api.post('/leads/bulk', data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; phone: string; email?: string; city?: string }) =>
      api.post('/leads', data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
