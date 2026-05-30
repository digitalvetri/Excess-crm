'use client';

import { useState, useEffect } from 'react';
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

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
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
  // Always null on both server and client during SSR — prevents hydration mismatch.
  // Populated from localStorage after mount, then replaced by the API response.
  const [snapshot, setSnapshot] = useState<AuthUser | null>(null);

  useEffect(() => {
    const cached = readCachedUser();
    if (cached) setSnapshot(cached);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get<{ data: AuthUser }>('/auth/me');
      writeCachedUser(res.data.data);
      setSnapshot(res.data.data);
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const user = data ?? snapshot;

  return {
    user,
    role: (user?.role ?? null) as UserRole | null,
    isLoading: isLoading && !snapshot,
    clearCache: clearCachedUser,
  };
}
