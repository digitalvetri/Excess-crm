'use client';

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  stage: string;
  sourceType: string;
  campaignName: string | null;
  adName: string | null;
  language: string | null;
  aiScore: number | null;
  aiScoreBreakdown: Record<string, unknown> | null;
  factSheet: Record<string, unknown> | null;
  tags: string[];
  ownerUserId: string | null;
  teamId: string | null;
  createdAt: string;
  stageChangedAt: string;
  receivedAt: string;
  firstContactedAt: string | null;
  updatedAt: string;
  scheduledAt: string | null;
  isDuplicate: boolean;
  duplicateOfId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}

interface LeadsPage {
  leads: Lead[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface LeadsResponse {
  data: LeadsPage;
}

// Cursor-paginated leads list. Flattens all fetched pages into a single `leads`
// array and exposes the controls the UI needs for "Load more" / infinite scroll.
export function useLeads(explicitParams?: Record<string, string>) {
  const searchParams = useSearchParams();
  const urlParams = Object.fromEntries(searchParams.entries());
  const filters = explicitParams !== undefined ? explicitParams : urlParams;

  const query = useInfiniteQuery({
    queryKey: ['leads', filters],
    queryFn: ({ pageParam }) =>
      api
        .get<LeadsResponse>('/leads', {
          params: { ...filters, ...(pageParam ? { cursor: pageParam } : {}) },
        })
        .then((r) => r.data.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });

  // Defensive: tolerate a partial/malformed page (e.g. an empty API response)
  // rather than producing [undefined].
  const leads = query.data?.pages.flatMap((p) => p?.leads ?? []) ?? [];

  return {
    leads,
    isLoading: query.isLoading,
    isError: query.isError,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

export interface LeadStats {
  totalLeads: number;
  newToday: number;
  callsToday: number;
  conversionRate: number;
  converted: number;
  newYesterday: number;
  callsYesterday: number;
  byStage: Record<string, number>;
}

export function useLeadStats() {
  return useQuery({
    queryKey: ['leads', 'stats'],
    queryFn: () => api.get<{ data: LeadStats }>('/leads/stats').then((r) => r.data.data),
    staleTime: 30_000,
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

export function useSendLeadEmail(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { subject: string; body: string }) =>
      api.post(`/leads/${leadId}/email`, data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads', leadId] });
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
