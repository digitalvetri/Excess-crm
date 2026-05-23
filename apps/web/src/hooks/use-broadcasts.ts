'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type BroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';

export interface BroadcastListItem {
  id: string;
  name: string;
  channel: string;
  templateName: string | null;
  status: BroadcastStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AudienceFilter {
  stage?: string;
  sourceType?: string;
  city?: string;
  tag?: string;
  amcWindow?: 'expiring30' | 'expiring60' | 'expired';
  subsidyStatus?: string;
  projectStage?: string;
}

export interface CreateBroadcastInput {
  name: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  bodyText?: string;
  audienceFilter: AudienceFilter;
  scheduledAt?: string;
}

export interface BroadcastTemplate {
  id: string;
  name: string;
  description: string;
  templateName: string;
  defaultAudienceFilter: Partial<AudienceFilter>;
  previewText: string;
}

export interface BroadcastCampaignStat {
  id: string;
  name: string;
  status: BroadcastStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  conversions: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface BroadcastAnalytics {
  totalSent: number;
  totalFailed: number;
  deliveryRate: number;
  byStatus: Record<string, number>;
  campaigns: BroadcastCampaignStat[];
}

export interface AudiencePreview {
  count: number;
  totalMatched: number;
  sample: { name: string; city: string | null }[];
}

export function useBroadcasts() {
  return useQuery({
    queryKey: ['broadcasts'],
    queryFn: () => api.get<{ data: BroadcastListItem[] }>('/broadcasts').then((r) => r.data.data),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((b) => b.status === 'SENDING') ? 4000 : false,
  });
}

export function usePreviewAudience() {
  return useMutation({
    mutationFn: (audienceFilter: AudienceFilter) =>
      api
        .post<{ data: AudiencePreview }>('/broadcasts/preview', { audienceFilter })
        .then((r) => r.data.data),
  });
}

export function useCreateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBroadcastInput) => api.post('/broadcasts', data).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

export function useStartBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/broadcasts/${id}/start`).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

export function useDeleteBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/broadcasts/${id}`).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

export function useBroadcastAnalytics() {
  return useQuery({
    queryKey: ['broadcast-analytics'],
    queryFn: () =>
      api.get<{ data: BroadcastAnalytics }>('/broadcasts/analytics').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

export function useBroadcastTemplates() {
  return useQuery({
    queryKey: ['broadcast-templates'],
    queryFn: () =>
      api.get<{ data: BroadcastTemplate[] }>('/broadcasts/templates').then((r) => r.data.data),
    staleTime: Infinity,
  });
}

export function useBroadcastEnrollSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ broadcastId, sequenceId }: { broadcastId: string; sequenceId: string }) =>
      api
        .post<{ data: { enrolled: number } }>(`/broadcasts/${broadcastId}/enroll-sequence`, { sequenceId })
        .then((r) => r.data.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}
