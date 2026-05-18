'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Franchise {
  id: string;
  name: string;
  type: string;
  status: 'ONBOARDING' | 'ACTIVE' | 'PROBATION' | 'SUSPENDED' | 'TERMINATED';
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  territory: Record<string, unknown> | null;
  createdAt: string;
  _count: { users: number; leads: number };
}

export interface FranchiseDetail extends Franchise {
  commissionSlabs: Record<string, unknown> | null;
  gstNumber: string | null;
  bankAccount: Record<string, unknown> | null;
  _count: { users: number; leads: number; commissions: number };
}

export interface FranchiseStats {
  totalLeads: number;
  convertedLeads: number;
  conversionRate: number;
  totalCommissions: number;
  pendingCommissions: number;
  totalEarnedInr: string;
}

export interface Commission {
  id: string;
  leadId: string;
  tenantId: string;
  dealValueInr: string;
  ratePercent: string;
  commissionInr: string;
  netPayableInr: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'ON_HOLD' | 'DISPUTED';
  approvedByUserId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface Payout {
  id: string;
  tenantId: string;
  amountInr: string;
  bankUtr: string | null;
  paidAt: string;
  commissionIds: string[];
  createdAt: string;
}

export function useFranchises() {
  return useQuery({
    queryKey: ['franchises'],
    queryFn: () => api.get<{ data: Franchise[] }>('/franchise').then((r) => r.data.data),
  });
}

export function useFranchise(id: string) {
  return useQuery({
    queryKey: ['franchises', id],
    queryFn: () => api.get<{ data: FranchiseDetail }>(`/franchise/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useFranchiseStats(id: string) {
  return useQuery({
    queryKey: ['franchises', id, 'stats'],
    queryFn: () => api.get<{ data: FranchiseStats }>(`/franchise/${id}/stats`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export interface CreateFranchiseInput {
  name: string;
  tier?: 'BRONZE' | 'SILVER' | 'GOLD';
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  gstNumber?: string;
}

export function useCreateFranchise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFranchiseInput) =>
      api.post<{ data: FranchiseDetail }>('/franchise', data).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['franchises'] });
    },
  });
}

export function useFranchiseAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'suspend' | 'terminate' }) =>
      api.post(`/franchise/${id}/${action}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['franchises'] });
    },
  });
}

export function useCommissions(filters?: { status?: string }) {
  return useQuery({
    queryKey: ['commissions', filters],
    queryFn: () =>
      api
        .get<{ data: { commissions: Commission[]; hasMore: boolean; nextCursor: string | null } }>('/commissions', {
          params: filters ?? {},
        })
        .then((r) => r.data.data.commissions),
  });
}

export function useApproveCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/commissions/${id}/approve`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commissions'] });
    },
  });
}

export function usePayouts() {
  return useQuery({
    queryKey: ['payouts'],
    queryFn: () =>
      api
        .get<{ data: { payouts: Payout[]; hasMore: boolean; nextCursor: string | null } }>('/payouts')
        .then((r) => r.data.data.payouts),
  });
}
