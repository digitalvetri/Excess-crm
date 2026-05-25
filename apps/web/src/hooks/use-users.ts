'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { UserRole } from '@excess/shared';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  tenantId: string;
  teamId: string | null;
  tenant: { id: string; name: string; type: string };
  team: { id: string; name: string } | null;
}

export interface FranchiseTenant {
  id: string;
  name: string;
  tier: string | null;
}

export interface UsersFilters {
  role?: string;
  status?: string;
  tenantId?: string;
  search?: string;
}

export function useAdminUsers(filters: UsersFilters = {}) {
  const params = new URLSearchParams();
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  if (filters.tenantId) params.set('tenantId', filters.tenantId);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();

  return useQuery({
    queryKey: ['admin-users', filters],
    queryFn: async () => {
      const res = await api.get<{ data: AdminUser[]; meta: { nextCursor: string | null } }>(
        `/users/admin${qs ? `?${qs}` : ''}`,
      );
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: ['admin-users', id],
    queryFn: async () => {
      const res = await api.get<{ data: AdminUser }>(`/users/admin/${id}`);
      return res.data.data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useFranchiseTenants() {
  return useQuery({
    queryKey: ['franchise-tenants'],
    queryFn: async () => {
      const res = await api.get<{ data: FranchiseTenant[] }>('/users/admin/tenants');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      email: string;
      name: string;
      phone?: string;
      role: string;
      tenantId?: string;
      password: string;
    }) => {
      const res = await api.post<{ data: AdminUser }>('/users/admin', body);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name?: string; phone?: string; role?: string; teamId?: string | null }) => {
      const res = await api.patch<{ data: AdminUser }>(`/users/admin/${id}`, body);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

export function useResetPassword(id: string) {
  return useMutation({
    mutationFn: async (password: string) => {
      await api.post(`/users/admin/${id}/reset-password`, { password });
    },
  });
}

export function useToggleUserStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (isActive: boolean) => {
      await api.patch(`/users/admin/${id}/status`, { isActive });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}
