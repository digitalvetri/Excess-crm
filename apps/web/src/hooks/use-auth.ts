'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { UserRole } from '@excess/shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string;
  teamId: string | null;
  tenant: { id: string; name: string; type: string; status: string };
}

export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get<{ data: AuthUser }>('/auth/me');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    user: data ?? null,
    role: (data?.role ?? null) as UserRole | null,
    isLoading,
  };
}
