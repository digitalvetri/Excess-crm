'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface Team {
  id: string;
  name: string;
  leaderUserId: string | null;
  createdAt: string;
  _count: { members: number; leads: number };
  members: Array<{ id: string; name: string; role: string }>;
}

export interface TeamDetail extends Team {
  members: TeamMember[];
  routingRules: RoutingRule[];
}

export interface RoutingRule {
  id: string;
  priority: number;
  condition: Record<string, unknown>;
  targetTeamId: string;
  isActive: boolean;
  createdAt: string;
  targetTeam: { id: string; name: string };
}

export interface CrmUser {
  id: string;
  name: string;
  email: string;
  role: string;
  teamId: string | null;
  team: { id: string; name: string } | null;
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => api.get<{ data: Team[] }>('/teams').then((r) => r.data.data),
  });
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: ['teams', id],
    queryFn: () => api.get<{ data: TeamDetail }>(`/teams/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ data: CrmUser[] }>('/users').then((r) => r.data.data),
  });
}

export function useAddTeamMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.post(`/teams/${teamId}/members`, { userId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teams'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useRemoveTeamMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/teams/${teamId}/members/${userId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teams'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useRoutingRules() {
  return useQuery({
    queryKey: ['routing-rules'],
    queryFn: () =>
      api.get<{ data: RoutingRule[] }>('/routing-rules').then((r) => r.data.data),
  });
}
