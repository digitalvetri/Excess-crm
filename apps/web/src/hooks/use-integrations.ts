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
    hasToken?: boolean;
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
