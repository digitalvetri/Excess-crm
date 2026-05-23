'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EngagementSummary {
  avgRating: string;
  totalReviews: number;
  referralsThisMonth: number;
  walletBalance: string;
  topAgent: string | null;
  topAgentDeals: number;
}

export interface AgentStat {
  userId: string;
  name: string;
  convertedLeads: number;
}

export interface FranchiseStat {
  tenantId: string;
  name: string;
  commissionInr: string;
}

export interface LeaderboardData {
  monthStart: string;
  agents: AgentStat[];
  franchises: FranchiseStat[];
}

export interface ReferralSummary {
  total: number;
  pending: number;
  converted: number;
  rewarded: number;
  totalRewardInr: string;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredLeadId: string;
  status: 'PENDING' | 'CONVERTED' | 'REWARDED';
  rewardInr?: string;
  rewardedAt?: string;
  createdAt: string;
  referrer: { id: string; name: string; phone: string } | null;
  referredLead?: { name: string; phone: string; stage: string };
}

export interface ReviewNps {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}

export interface ReviewSummary {
  avgRating: string | number;
  totalCount: number;
  distribution: { rating: number; count: number }[];
  nps: ReviewNps;
}

export interface Review {
  id: string;
  leadId: string;
  rating: number;
  comment?: string;
  source: string;
  npsScore: number | null;
  npsComment: string | null;
  createdAt: string;
  lead?: { id: string; name: string; phone: string };
}

export interface WalletTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amountInr: string;
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  balanceInr: string;
  updatedAt: string;
}

// ─── Engagement summary ────────────────────────────────────────────────────────

export function useEngagementSummary() {
  return useQuery({
    queryKey: ['engagement-summary'],
    queryFn: () =>
      api.get<{ data: EngagementSummary }>('/engagement/summary').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export function useLeaderboardData() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () =>
      api.get<{ data: LeaderboardData }>('/leaderboard').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

// ─── Referrals ────────────────────────────────────────────────────────────────

export function useReferralSummary() {
  return useQuery({
    queryKey: ['referral-summary'],
    queryFn: () =>
      api.get<{ data: ReferralSummary }>('/referrals/summary').then((r) => r.data.data),
    staleTime: 30_000,
  });
}

export function useReferralList(status?: string) {
  return useQuery({
    queryKey: ['referrals', status],
    queryFn: () =>
      api
        .get<{ data: Referral[] }>('/referrals', { params: status ? { status } : {} })
        .then((r) => r.data.data),
  });
}

export function useCreateReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { referrerId: string; referredLeadId: string }) =>
      api.post<{ data: Referral }>('/referrals', data).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      void qc.invalidateQueries({ queryKey: ['referral-summary'] });
      void qc.invalidateQueries({ queryKey: ['engagement-summary'] });
    },
  });
}

export function useMarkConverted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/referrals/${id}`, { status: 'CONVERTED' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      void qc.invalidateQueries({ queryKey: ['referral-summary'] });
    },
  });
}

export function useRewardReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rewardInr }: { id: string; rewardInr: number }) =>
      api.post(`/referrals/${id}/reward`, { rewardInr }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      void qc.invalidateQueries({ queryKey: ['referral-summary'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['engagement-summary'] });
    },
  });
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export function useReviewSummary() {
  return useQuery({
    queryKey: ['review-summary'],
    queryFn: () =>
      api.get<{ data: ReviewSummary }>('/reviews/summary').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

export function useReviewList(filters?: { rating?: number; leadId?: string }) {
  return useQuery({
    queryKey: ['reviews', filters],
    queryFn: () =>
      api
        .get<{ data: Review[] }>('/reviews', {
          params: {
            ...(filters?.rating  && { rating: filters.rating }),
            ...(filters?.leadId  && { leadId: filters.leadId }),
          },
        })
        .then((r) => r.data.data),
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { leadId: string; rating: number; comment?: string; source?: string }) =>
      api.post<{ data: Review }>('/reviews', data).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      void qc.invalidateQueries({ queryKey: ['review-summary'] });
      void qc.invalidateQueries({ queryKey: ['engagement-summary'] });
    },
  });
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export function useWalletData() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () =>
      api
        .get<{ data: { wallet: Wallet; transactions: WalletTransaction[] } }>('/wallet')
        .then((r) => r.data.data),
    staleTime: 30_000,
  });
}

export function useWalletTransactions(type?: 'CREDIT' | 'DEBIT') {
  return useQuery({
    queryKey: ['wallet-transactions', type],
    queryFn: async () => {
      const r = await api.get<{ data: { transactions: WalletTransaction[]; hasMore: boolean } }>(
        '/wallet/transactions',
      );
      const txns = r.data.data.transactions;
      return type ? txns.filter((t) => t.type === type) : txns;
    },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type: 'CREDIT' | 'DEBIT';
      amountInr: number;
      description: string;
      referenceId?: string;
    }) => api.post<{ data: WalletTransaction }>('/wallet/transactions', data).then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      void qc.invalidateQueries({ queryKey: ['engagement-summary'] });
    },
  });
}
