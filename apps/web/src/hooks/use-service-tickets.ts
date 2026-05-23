'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ServiceTicketType   = 'COMPLAINT' | 'AMC_VISIT' | 'WARRANTY' | 'GENERAL';
export type ServiceTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type ActivityEntryType   = 'created' | 'status_change' | 'comment' | 'photo' | 'visit_scheduled' | 'assigned' | 'sla_breach';

export const SERVICE_TICKET_TYPES: ServiceTicketType[]     = ['COMPLAINT', 'AMC_VISIT', 'WARRANTY', 'GENERAL'];
export const SERVICE_TICKET_STATUSES: ServiceTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export const TYPE_LABEL: Record<ServiceTicketType, string> = {
  COMPLAINT: 'Complaint',
  AMC_VISIT: 'AMC Visit',
  WARRANTY:  'Warranty',
  GENERAL:   'General',
};

export const STATUS_LABEL: Record<ServiceTicketStatus, string> = {
  OPEN:        'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED:    'Resolved',
  CLOSED:      'Closed',
};

export const SLA_RESOLVE_HOURS: Record<string, number> = {
  P1: 24,
  P2: 48,
  P3: 120,
  P4: 240,
};

export interface ActivityEntry {
  id: string;
  type: ActivityEntryType;
  text?: string;
  fromStatus?: string;
  toStatus?: string;
  photoUrl?: string;
  s3Key?: string;
  caption?: string;
  visitAt?: string;
  engineerName?: string;
  authorName: string;
  authorId: string;
  createdAt: string;
}

export interface ServiceTicketListItem {
  id: string;
  type: ServiceTicketType;
  subject: string;
  status: ServiceTicketStatus;
  priority: string;
  scheduledVisitAt: string | null;
  assignedEngineerId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  projectId: string | null;
  lead:    { id: string; name: string; phone: string };
  project: { id: string; number: string } | null;
}

export interface ServiceTicketDetail {
  id: string;
  type: ServiceTicketType;
  subject: string;
  description: string;
  status: ServiceTicketStatus;
  priority: string;
  scheduledVisitAt: string | null;
  assignedEngineerId: string | null;
  assignedEngineerName: string | null;
  resolvedAt: string | null;
  createdByUserId: string | null;
  createdByUserName: string | null;
  createdAt: string;
  updatedAt: string;
  activityLog: ActivityEntry[];
  lead:    { id: string; name: string; phone: string; email: string | null; city: string | null };
  project: { id: string; number: string; stage: string } | null;
}

export interface CreateServiceTicketInput {
  leadId:             string;
  projectId?:         string;
  type:               ServiceTicketType;
  subject:            string;
  description:        string;
  priority?:          string;
  scheduledVisitAt?:  string;
  assignedEngineerId?: string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useServiceTickets(filters?: { status?: string; type?: string; projectId?: string; from?: string; to?: string; limit?: number }) {
  return useQuery({
    queryKey: ['service-tickets', filters ?? {}],
    queryFn: () =>
      api
        .get<{ data: { tickets: ServiceTicketListItem[]; hasMore: boolean; nextCursor: string | null } }>(
          '/service-tickets',
          { params: filters ?? {} },
        )
        .then((r) => r.data.data),
  });
}

export function useScheduledTickets(visitFrom: string, visitTo: string) {
  return useQuery({
    queryKey: ['service-tickets-schedule', visitFrom, visitTo],
    queryFn: () =>
      api
        .get<{ data: { tickets: ServiceTicketListItem[] } }>(
          '/service-tickets',
          { params: { visitFrom, visitTo, limit: 500 } },
        )
        .then((r) => r.data.data.tickets),
    staleTime: 2 * 60 * 1000,
  });
}

export function useUnscheduledTickets() {
  return useQuery({
    queryKey: ['service-tickets-unscheduled'],
    queryFn: () =>
      api
        .get<{ data: { tickets: ServiceTicketListItem[] } }>(
          '/service-tickets',
          { params: { unscheduled: 'true', status: 'OPEN', limit: 100 } },
        )
        .then((r) => r.data.data.tickets),
    staleTime: 2 * 60 * 1000,
  });
}

export interface EngineerUser { id: string; name: string; role: string }

export function useEngineers() {
  return useQuery({
    queryKey: ['users', 'engineers'],
    queryFn: () =>
      api.get<{ data: EngineerUser[] }>('/users')
        .then((r) => r.data.data.filter((u) => u.role === 'ENGINEER'))
        .catch(() => [] as EngineerUser[]),
  });
}

export function useServiceTicket(id: string) {
  return useQuery({
    queryKey: ['service-tickets', id],
    queryFn: () =>
      api.get<{ data: ServiceTicketDetail }>(`/service-tickets/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateServiceTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateServiceTicketInput) =>
      api.post('/service-tickets', data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['service-tickets'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateServiceTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/service-tickets/${id}`, data).then((r) => r.data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['service-tickets'] });
      void qc.invalidateQueries({ queryKey: ['service-tickets', vars.id] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useAddTicketComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.post(`/service-tickets/${id}/comments`, { text }).then((r) => r.data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['service-tickets', vars.id] });
    },
  });
}

export function useUploadTicketPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file, caption }: { id: string; file: File; caption?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      return api.post(`/service-tickets/${id}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data);
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['service-tickets', vars.id] });
    },
  });
}

export function useDeleteTicketPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, photoId }: { id: string; photoId: string }) =>
      api.delete(`/service-tickets/${id}/photos/${photoId}`),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['service-tickets', vars.id] });
    },
  });
}

export function useNotifyTicket() {
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      api.post(`/service-tickets/${id}/notify`, { message }).then((r) => r.data),
  });
}

export function useBulkUpdateTickets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[]; data: { assignedEngineerId?: string | null; status?: ServiceTicketStatus } }) =>
      api.post('/service-tickets/bulk', payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['service-tickets'] });
    },
  });
}

export interface ServiceTicketAlerts {
  overdueCount: number;
  unassignedP1Count: number;
}

export function useServiceTicketAlerts() {
  return useQuery({
    queryKey: ['service-tickets-alerts'],
    queryFn: () =>
      api.get<{ data: ServiceTicketAlerts }>('/service-tickets/alerts').then((r) => r.data.data),
    refetchInterval: 5 * 60 * 1000,
    staleTime:       5 * 60 * 1000,
  });
}
