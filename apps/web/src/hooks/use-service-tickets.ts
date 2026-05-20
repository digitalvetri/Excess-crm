'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ServiceTicketType = 'COMPLAINT' | 'AMC_VISIT' | 'WARRANTY' | 'GENERAL';
export type ServiceTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export const SERVICE_TICKET_TYPES: ServiceTicketType[] = ['COMPLAINT', 'AMC_VISIT', 'WARRANTY', 'GENERAL'];
export const SERVICE_TICKET_STATUSES: ServiceTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export const TYPE_LABEL: Record<ServiceTicketType, string> = {
  COMPLAINT: 'Complaint',
  AMC_VISIT: 'AMC Visit',
  WARRANTY: 'Warranty',
  GENERAL: 'General',
};

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
  lead: { id: string; name: string; phone: string };
  project: { id: string; number: string } | null;
}

export interface CreateServiceTicketInput {
  leadId: string;
  projectId?: string;
  type: ServiceTicketType;
  subject: string;
  description: string;
  priority?: string;
  scheduledVisitAt?: string;
}

export function useServiceTickets(filters?: { status?: string; type?: string; projectId?: string }) {
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['service-tickets'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
