'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AmcStatus = 'ACTIVE' | 'RENEWED' | 'CANCELLED';
export type AmcWindow = 'all' | 'active' | 'expiring30' | 'expiring60' | 'expired' | 'renewed' | 'cancelled';

export interface AmcContract {
  id:         string;
  planYears:  number;
  startDate:  string;
  endDate:    string;
  valueInr:   string | null;
  status:     AmcStatus;
  notes:      string | null;
  createdAt:  string;
  project:    { id: string; number: string; systemKw: string };
  lead:       { id: string; name: string; phone: string; city: string | null };
}

export interface AmcStats {
  active:     number;
  renewed:    number;
  cancelled:  number;
  expiring30: number;
  expired:    number;
}

export interface AmcListResult {
  contracts:  AmcContract[];
  hasMore:    boolean;
  nextCursor: string | null;
  stats:      AmcStats;
}

export interface CreateAmcInput {
  projectId:  string;
  planYears:  number;
  startDate:  string;
  valueInr?:  number;
  notes?:     string;
}

export interface RenewAmcInput {
  planYears:  number;
  valueInr?:  number;
  notes?:     string;
}

export interface AmcContractDetail extends Omit<AmcContract, 'project' | 'lead'> {
  updatedAt:         string;
  createdByUserName: string | null;
  project: { id: string; number: string; systemKw: string; stage: string };
  lead:    { id: string; name: string; phone: string; city: string | null; email: string | null };
  history: Array<Pick<AmcContract, 'id' | 'planYears' | 'startDate' | 'endDate' | 'valueInr' | 'status' | 'createdAt'>>;
}

export function useAmcContract(id: string) {
  return useQuery({
    queryKey: ['amc-contracts', id],
    queryFn:  () =>
      api
        .get<{ data: AmcContractDetail }>(`/amc-contracts/${id}`)
        .then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useAmcContracts(filters?: { window?: AmcWindow; projectId?: string }) {
  return useQuery({
    queryKey: ['amc-contracts', filters ?? {}],
    queryFn:  () =>
      api
        .get<{ data: AmcListResult }>('/amc-contracts', { params: filters ?? {} })
        .then((r) => r.data.data),
  });
}

export function useCreateAmcContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAmcInput) =>
      api.post('/amc-contracts', data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['amc-contracts'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useCancelAmcContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch(`/amc-contracts/${id}`, { status: 'CANCELLED' }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['amc-contracts'] });
    },
  });
}

export function useRenewAmcContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RenewAmcInput }) =>
      api.post(`/amc-contracts/${id}/renew`, data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['amc-contracts'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useBulkRenewAmc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[]; planYears: number }) =>
      api.post('/amc-contracts/bulk-renew', payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['amc-contracts'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
