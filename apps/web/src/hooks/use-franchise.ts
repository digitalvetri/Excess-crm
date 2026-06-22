'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FranchiseStatus    = 'ONBOARDING' | 'ACTIVE' | 'PROBATION' | 'SUSPENDED' | 'TERMINATED';
export type FranchiseTier      = 'BRONZE' | 'SILVER' | 'GOLD';
export type CommissionStatus   = 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'ON_HOLD' | 'DISPUTED';
export type FranchiseAgentRole = 'OWNER' | 'SALES' | 'SURVEY' | 'FOLLOWUP';

export interface Franchise {
  id: string; name: string; type: string;
  status: FranchiseStatus; tier: FranchiseTier | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  territory: Record<string, unknown> | null; createdAt: string;
  _count: { users: number; leads: number };
}

export interface FranchiseDetail extends Franchise {
  commissionSlabs: Record<string, number> | null;
  agentSplitConfig: Record<string, number> | null;
  gstNumber: string | null;
  bankAccount: Record<string, string> | null;
  _count: { users: number; leads: number; commissions: number };
}

export interface FranchiseStats {
  totalLeads: number; convertedLeads: number; conversionRate: number;
  totalCommissions: number; pendingCommissions: number; totalEarnedInr: string;
}

export interface NetworkSummary {
  total: number; active: number; onboarding: number; suspended: number; probation: number;
  pendingCommissionCount: number; pendingCommissionInr: string;
}

export interface Commission {
  id: string; leadId: string; tenantId: string; systemKw: string | null;
  dealValueInr: string; ratePercent: string; commissionInr: string; netPayableInr: string;
  gstInr: string | null; deductionsInr: string | null; status: CommissionStatus;
  approvedByUserId: string | null; paidAt: string | null; payoutId: string | null;
  createdAt: string;
  leadName: string | null; leadPhone: string | null; franchiseName: string | null;
}

export interface CommissionSummary {
  pendingCount: number; pendingInr: string;
  approvedCount: number; approvedInr: string;
  paidCount: number; paidInr: string;
}

export interface Payout {
  id: string; tenantId: string; franchiseName: string;
  amountInr: string; bankUtr: string | null; paidAt: string;
  commissionIds: string[]; createdAt: string;
}

export interface CreateFranchiseInput {
  name: string; tier?: FranchiseTier;
  contactName?: string; contactEmail?: string; contactPhone?: string; gstNumber?: string;
}

export interface UpdateFranchiseInput {
  name?: string; tier?: FranchiseTier;
  contactName?: string; contactEmail?: string; contactPhone?: string; gstNumber?: string;
  commissionSlabs?: Record<string, number>;
  agentSplitConfig?: Record<string, number>;
  bankAccount?: Record<string, string>;
  territory?: Record<string, unknown>;
}

export interface CreateCommissionInput {
  leadId: string; dealValueInr: number; ratePercent: number;
  gstInr?: number; deductionsInr?: number;
}

export interface FranchiseAgent {
  id: string; name: string; email: string; phone: string | null;
  role: string; agentRole: FranchiseAgentRole | null;
  isActive: boolean; createdAt: string;
  leadsThisMonth: number; splitsCount: number; totalEarnedInr: number;
}

export interface FranchiseInvite {
  id: string; email: string; name: string;
  agentRole: FranchiseAgentRole; createdAt: string; expiresAt: string;
}

export interface LeaderboardEntry {
  id: string; name: string; tier: FranchiseTier | null; status: FranchiseStatus;
  city: string | null; state: string | null; agentCount: number;
  leadsReceived: number; dealsClosed: number; conversionRate: number; revenueInr: number;
}

export interface InviteAgentInput {
  email: string; name: string; agentRole: FranchiseAgentRole;
}

export interface OnboardFranchiseInput {
  name: string;
  tier?: FranchiseTier;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  gstNumber?: string;
  territory: { state: string; city: string; district?: string; pinCodes: string[] };
  commissionSlabs?: Record<string, number>;
  agentSplitConfig?: Record<string, number>;
  bankAccount?: Record<string, string>;
}

// ─── Franchise queries ────────────────────────────────────────────────────────

export function useNetworkSummary() {
  return useQuery({
    queryKey: ['franchise-summary'],
    queryFn: () => api.get<{ data: NetworkSummary }>('/franchise/summary').then((r) => r.data.data),
    staleTime: 30_000,
  });
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

// ─── Franchise mutations ──────────────────────────────────────────────────────

export function useCreateFranchise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFranchiseInput) =>
      api.post<{ data: FranchiseDetail }>('/franchise', data).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['franchises'] });
      void qc.invalidateQueries({ queryKey: ['franchise-summary'] });
    },
  });
}

export function useUpdateFranchise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFranchiseInput }) =>
      api.patch<{ data: FranchiseDetail }>(`/franchise/${id}`, data).then((r) => r.data.data),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['franchises', id] });
      void qc.invalidateQueries({ queryKey: ['franchises'] });
    },
  });
}

export function useFranchiseAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'suspend' | 'terminate' | 'probation' }) =>
      api.post(`/franchise/${id}/${action}`),
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: ['franchises', id] });
      void qc.invalidateQueries({ queryKey: ['franchises'] });
      void qc.invalidateQueries({ queryKey: ['franchise-summary'] });
    },
  });
}

// ─── Commissions ─────────────────────────────────────────────────────────────

export function useCommissionSummary() {
  return useQuery({
    queryKey: ['commission-summary'],
    queryFn: () => api.get<{ data: CommissionSummary }>('/commissions/summary').then((r) => r.data.data),
    staleTime: 30_000,
  });
}

export function useCommissions(filters?: { status?: string; franchiseId?: string }) {
  return useQuery({
    queryKey: ['commissions', filters],
    queryFn: () =>
      api
        .get<{ data: { commissions: Commission[]; hasMore: boolean } }>('/commissions', { params: filters ?? {} })
        .then((r) => r.data.data),
  });
}

export function useCreateCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCommissionInput) =>
      api.post<{ data: Commission }>('/commissions', data).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commissions'] });
      void qc.invalidateQueries({ queryKey: ['commission-summary'] });
    },
  });
}

export function useApproveCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/commissions/${id}/approve`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commissions'] });
      void qc.invalidateQueries({ queryKey: ['commission-summary'] });
    },
  });
}

export function useDisputeCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/commissions/${id}/dispute`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['commissions'] });
      void qc.invalidateQueries({ queryKey: ['commission-summary'] });
    },
  });
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

export function usePayouts(filters?: { franchiseId?: string }) {
  return useQuery({
    queryKey: ['payouts', filters],
    queryFn: () =>
      api
        .get<{ data: { payouts: Payout[]; hasMore: boolean } }>('/payouts', { params: filters ?? {} })
        .then((r) => r.data.data),
  });
}

export function useCreatePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { commissionIds: string[]; bankUtr?: string; paidAt?: string }) =>
      api.post<{ data: Payout }>('/payouts', data).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payouts'] });
      void qc.invalidateQueries({ queryKey: ['commissions'] });
      void qc.invalidateQueries({ queryKey: ['commission-summary'] });
      void qc.invalidateQueries({ queryKey: ['franchises'] });
    },
  });
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export function useLeaderboard(period: 'month' | 'quarter' | 'year' = 'month') {
  return useQuery({
    queryKey: ['franchise-leaderboard', period],
    queryFn: () =>
      api
        .get<{ data: { period: string; since: string; franchises: LeaderboardEntry[] } }>(
          '/franchise/leaderboard',
          { params: { period } },
        )
        .then((r) => r.data.data),
    staleTime: 60_000,
  });
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export function useFranchiseAgents(franchiseId: string) {
  return useQuery({
    queryKey: ['franchise-agents', franchiseId],
    queryFn: () =>
      api
        .get<{ data: { agents: FranchiseAgent[]; pendingInvites: FranchiseInvite[] } }>(
          `/franchise/${franchiseId}/agents`,
        )
        .then((r) => r.data.data),
    enabled: !!franchiseId,
  });
}

export function useInviteAgent(franchiseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteAgentInput) =>
      api.post(`/franchise/${franchiseId}/agents/invite`, data).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['franchise-agents', franchiseId] }),
  });
}

export function useUpdateAgent(franchiseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: { agentRole?: string; isActive?: boolean } }) =>
      api.patch(`/franchise/${franchiseId}/agents/${userId}`, data).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['franchise-agents', franchiseId] }),
  });
}

export function useOnboardFranchise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OnboardFranchiseInput) =>
      api.post<{ data: { id: string } }>('/franchise', {
        name:             data.name,
        tier:             data.tier,
        contactName:      data.contactName,
        contactEmail:     data.contactEmail,
        contactPhone:     data.contactPhone,
        gstNumber:        data.gstNumber,
        territory:        data.territory,
        commissionSlabs:  data.commissionSlabs,
        agentSplitConfig: data.agentSplitConfig,
        bankAccount:      data.bankAccount,
      }).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['franchises'] });
      void qc.invalidateQueries({ queryKey: ['franchise-summary'] });
    },
  });
}
