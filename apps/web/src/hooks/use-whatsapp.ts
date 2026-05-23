'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface WhatsappConfig {
  phoneNumberId:      string;
  businessAccountId:  string;
  displayName:        string | null;
  webhookVerifyToken: string;
  webhookUrl:         string;
  isConnected:        boolean;
  connectedAt:        string | null;
  hasToken:           boolean;
}

export interface WhatsappConfigInput {
  phoneNumberId:     string;
  businessAccountId: string;
  accessToken:       string;
  displayName?:      string | undefined;
}

export function useWhatsappConfig() {
  return useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: () =>
      api.get<{ data: WhatsappConfig | null }>('/whatsapp/config').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

export function useSaveWhatsappConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WhatsappConfigInput) =>
      api.put<{ data: WhatsappConfig }>('/whatsapp/config', data).then((r) => r.data.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp-config'] }),
  });
}

export function useDisconnectWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/whatsapp/config').then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp-config'] }),
  });
}

export interface WaConversation {
  id: string;
  leadId: string;
  phone: string;
  sessionExpiresAt: string;
  lastMessageAt: string;
  lead?: { name: string; phone: string; stage: string };
}

export interface WaMessage {
  id: string;
  leadId: string;
  type: string;
  actorIsAi: boolean;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function useConversations() {
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: { conversations: WaConversation[]; hasMore: boolean; nextCursor: string | null } }>('/whatsapp/conversations')
      .then((r) => {
        if (!cancelled) {
          setConversations(r.data.data.conversations);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load conversations';
          setError(message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { conversations, loading, error, refetch };
}

export function useMessages(leadId: string | null) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const prevLeadId = useRef<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setMessages([]);
      return;
    }

    // Reset messages when switching conversations
    if (prevLeadId.current !== leadId) {
      setMessages([]);
      prevLeadId.current = leadId;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ data: { leadId: string; messages: WaMessage[] } }>(`/whatsapp/conversations/${leadId}`)
      .then((r) => {
        if (!cancelled) {
          setMessages(r.data.data.messages);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load messages';
          setError(message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leadId, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { messages, loading, error, refetch };
}

export function useSendMessage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (leadId: string, message: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/whatsapp/send', { leadId, message });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send message';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { send, loading, error };
}
