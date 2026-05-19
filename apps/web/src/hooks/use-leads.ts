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
  aiScoreBreakdown: Record<string, unknown> | null;
  tags: string[];
  ownerUserId: string | null;
  createdAt: string;
  stageChangedAt: string;
  scheduledAt: string | null;
  isDuplicate: boolean;
  duplicateOfId: string | null;
}

interface LeadsResponse {
  data: {
    leads: Lead[];
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export function useLeads(explicitParams?: Record<string, string>) {
  const searchParams = useSearchParams();
  const urlParams = Object.fromEntries(searchParams.entries());
  const filters = explicitParams !== undefined ? explicitParams : urlParams;

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

export function useUpdateLeadTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
      api.patch(`/leads/${id}/tags`, { tags }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useMergeLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ masterId, duplicateId }: { masterId: string; duplicateId: string }) =>
      api.post(`/leads/${masterId}/merge`, { duplicateId }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useLeadSummary(leadId: string | null) {
  return useQuery({
    queryKey: ['leads', leadId, 'summary'],
    queryFn: () =>
      api.get<{ data: { summary: string; generatedAt: string } }>(`/leads/${leadId}/summary`)
        .then((r) => r.data.data),
    enabled: !!leadId,
    staleTime: 60 * 60 * 1000,
  });
}

export function useSavedViews() {
  return useQuery({
    queryKey: ['saved-views'],
    queryFn: () =>
      api.get<{ data: SavedView[] }>('/leads/views').then((r) => r.data.data),
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; filters: Record<string, string>; icon?: string; isShared?: boolean }) =>
      api.post('/leads/views', data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-views'] });
    },
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/leads/views/${id}`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-views'] });
    },
  });
}

export interface SavedView {
  id: string;
  name: string;
  icon: string | null;
  isShared: boolean;
  filters: Record<string, string>;
  createdAt: string;
}
