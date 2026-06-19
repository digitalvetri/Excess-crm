'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type IntegrationType = 'JUSTDIAL' | 'INDIAMART' | 'META';

export interface IntegrationSource {
  id: string;
  type: IntegrationType;
  label: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  config: {
    // JustDial
    hasSecret?: boolean;
    webhookUrl?: string;
    // IndiaMART
    hasApiKey?: boolean;
    mobile?: string | null;
    pullFrequency?: 'manual' | 'daily' | 'hourly';
    // Meta
    pageId?: string | null;
    pageName?: string | null;
    formId?: string | null;
    formName?: string | null;
    hasToken?: boolean;
    hasPendingPages?: boolean;
    fieldMapping?: Record<string, string>;
  };
  _count: { leads: number };
}

interface VerifyResult {
  data: {
    verified: boolean;
    message: string;
    webhookUrl?: string;
    pageId?: string;
    pageName?: string;
  };
}

export interface MetaPage {
  id: string;
  name: string;
  category?: string;
}

export interface MetaForm {
  id: string;
  name: string;
  status?: string;
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get<{ data: IntegrationSource[] }>('/integrations').then((r) => r.data.data),
  });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: IntegrationType; label: string; config: Record<string, unknown> }) =>
      api.post('/integrations', data).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { label?: string; config?: Record<string, unknown>; isActive?: boolean } }) =>
      api.patch(`/integrations/${id}`, data).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/${id}`).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useVerifyIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<VerifyResult>(`/integrations/${id}/verify`).then((r) => r.data.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useSyncIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/sync`).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useMetaOAuthUrl() {
  return useMutation({
    mutationFn: () =>
      api.get<{ data: { url: string } }>('/integrations/meta/oauth-url').then((r) => r.data.data.url),
  });
}

export function useMetaPages(enabled: boolean) {
  return useQuery({
    queryKey: ['meta-pages'],
    queryFn: () =>
      api
        .get<{ data: { pages: MetaPage[]; sourceId: string } }>('/integrations/meta/pages')
        .then((r) => r.data.data),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaPageForms(pageId: string | null) {
  return useQuery({
    queryKey: ['meta-page-forms', pageId],
    queryFn: () =>
      api
        .get<{ data: { forms: MetaForm[] } }>(`/integrations/meta/pages/${pageId}/forms`)
        .then((r) => r.data.data.forms),
    enabled: !!pageId,
    staleTime: 5 * 60 * 1000,
  });
}

export interface IntegrationHealthEntry {
  sourceId: string;
  type: string;
  isActive: boolean;
  leadsToday: number;
  leadsThisWeek: number;
  lastLeadAt: string | null;
  status: 'healthy' | 'slow' | 'stale' | 'inactive';
}

export interface IntegrationHealthSummary {
  health: IntegrationHealthEntry[];
  totalLeadsToday: number;
  totalLeadsThisWeek: number;
}

export function useIntegrationHealth() {
  return useQuery({
    queryKey: ['integration-health'],
    queryFn: () =>
      api
        .get<{ data: IntegrationHealthSummary }>('/integrations/health')
        .then((r) => r.data.data),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}

export function useMetaConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sourceId: string; pageId: string; formId?: string; formName?: string }) =>
      api
        .post<{ data: { connected: boolean; pageName: string; subscribed: boolean; message: string } }>(
          '/integrations/meta/connect',
          data,
        )
        .then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['integrations'] });
      void qc.invalidateQueries({ queryKey: ['meta-pages'] });
    },
  });
}
