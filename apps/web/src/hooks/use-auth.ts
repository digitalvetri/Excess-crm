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

const AUTH_CACHE_KEY = 'excess.auth.me';

function readCachedUser(): AuthUser | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedUser(user: AuthUser) {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

function clearCachedUser() {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get<{ data: AuthUser }>('/auth/me');
      writeCachedUser(res.data.data);
      return res.data.data;
    },
    // Seed from localStorage so the sidebar renders immediately on every page load
    initialData: readCachedUser,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    user: data ?? null,
    role: (data?.role ?? null) as UserRole | null,
    isLoading,
    clearCache: clearCachedUser,
  };
}
