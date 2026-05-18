'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

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
  }, []);

  return { conversations, loading, error };
}

export function useMessages(leadId: string | null) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setMessages([]);
      return;
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
  }, [leadId]);

  return { messages, loading, error };
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
