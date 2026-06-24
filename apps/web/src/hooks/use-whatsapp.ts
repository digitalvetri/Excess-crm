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

export interface WhatsappStatus {
  connected: boolean;
  source: 'tenant' | 'env' | null;
}

// Whether WhatsApp can actually send right now (per-tenant config OR env fallback).
export function useWhatsappStatus() {
  return useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () =>
      api.get<{ data: WhatsappStatus }>('/whatsapp/status').then((r) => r.data.data),
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

export type ConversationStatus = 'OPEN' | 'PENDING' | 'RESOLVED';

export interface WaConversation {
  id: string;
  leadId: string;
  phone: string;
  sessionExpiresAt: string;
  lastMessageAt: string;
  lastMessagePreview?: string | null;
  assignee?: { userId: string; name: string } | null;
  status?: ConversationStatus;
  unread?: number;
  waitingSince?: string | null;
  lead?: { name: string; phone: string; stage: string; aiScore?: number | null };
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

  const send = useCallback(
    async (leadId: string, message: string, replyTo?: { waId?: string; text: string }): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/whatsapp/send', { leadId, message, ...(replyTo ? { replyTo } : {}) });
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

// Short-lived presigned URL for a message's media (once the worker has stored it in S3).
export function useMediaUrl(activityId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['whatsapp', 'media', activityId],
    queryFn: () =>
      api
        .get<{ data: { url: string | null; ready: boolean; type?: string | null } }>(`/whatsapp/media/${activityId}`)
        .then((r) => r.data.data)
        .catch(() => ({ url: null, ready: false })),
    enabled,
    staleTime: 4 * 60_000,
  });
}

export interface WaTemplate {
  id: string;
  name: string;
  templateName: string;
  previewText: string;
  description: string;
}

// Approved template library (for sending outside the 24h window). Tolerant of 403
// (e.g. roles without broadcasts.read) — resolves to [] so the UI just hides the button.
export function useWhatsappTemplates() {
  return useQuery({
    queryKey: ['whatsapp', 'templates'],
    queryFn: () =>
      api.get<{ data: WaTemplate[] }>('/broadcasts/templates').then((r) => r.data.data).catch(() => [] as WaTemplate[]),
    staleTime: 5 * 60_000,
  });
}

export function useSendMedia() {
  const [sending, setSending] = useState(false);
  const sendMedia = useCallback(async (leadId: string, file: File, caption: string): Promise<void> => {
    setSending(true);
    try {
      // Order matters: text fields must precede the file part so the server parses them.
      const form = new FormData();
      form.append('leadId', leadId);
      if (caption) form.append('caption', caption);
      form.append('file', file);
      await api.post('/whatsapp/send-media', form);
    } finally {
      setSending(false);
    }
  }, []);
  return { sendMedia, sending };
}

export function useSendTemplate() {
  const [sending, setSending] = useState(false);
  const sendTemplate = useCallback(
    async (leadId: string, templateName: string, label: string, params: Record<string, string>): Promise<void> => {
      setSending(true);
      try {
        await api.post('/whatsapp/send-template', { leadId, templateName, label, params });
      } finally {
        setSending(false);
      }
    },
    [],
  );
  return { sendTemplate, sending };
}

// Live inbox updates via Server-Sent Events (proxied same-origin). Calls onUpdate(leadId)
// whenever a conversation changes (inbound/outbound message, status). Auto-reconnects.
export function useWhatsappStream(onUpdate: (leadId: string) => void) {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/v1/whatsapp/stream');
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as { leadId?: string };
        if (d?.leadId) cb.current(d.leadId);
      } catch {
        /* ignore malformed frames (e.g. keep-alive comments) */
      }
    };
    return () => es.close();
  }, []);
}

export interface ConversationAssist {
  summary: string;
  suggestions: string[];
}

// AI assist for the open chat: a summary + ready-to-send reply suggestions (on demand).
export function useConversationAssist() {
  const [data, setData] = useState<ConversationAssist | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (leadId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: ConversationAssist }>(`/whatsapp/conversations/${leadId}/assist`);
      setData(res.data.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? 'AI assist is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { run, data, loading, error, reset };
}

// Inbox triage: set conversation status, clear unread, (re)assign the owner.
export function useConversationActions() {
  const setStatus = useCallback(
    (leadId: string, status: ConversationStatus) =>
      api.patch(`/whatsapp/conversations/${leadId}/status`, { status }).then(() => undefined),
    [],
  );
  const markRead = useCallback(
    (leadId: string) => api.post(`/whatsapp/conversations/${leadId}/read`).then(() => undefined),
    [],
  );
  const assign = useCallback(
    (leadId: string, userId: string) =>
      api.patch(`/leads/${leadId}/assign`, { userId }).then(() => undefined),
    [],
  );
  const react = useCallback(
    (leadId: string, messageId: string, waId: string, emoji: string) =>
      api.post('/whatsapp/react', { leadId, messageId, waId, emoji }).then(() => undefined),
    [],
  );
  return { setStatus, markRead, assign, react };
}

// AI-drafts a reply for the lead's conversation. Returns the suggested text; the rep
// edits and sends it (never sent autonomously).
export function useDraftReply() {
  const [drafting, setDrafting] = useState(false);

  const draftReply = useCallback(
    async (leadId: string, channel: 'whatsapp' | 'email' = 'whatsapp'): Promise<string> => {
      setDrafting(true);
      try {
        const res = await api.post<{ data: { draft: string } }>(`/leads/${leadId}/draft-reply`, { channel });
        return res.data.data.draft;
      } finally {
        setDrafting(false);
      }
    },
    [],
  );

  return { draftReply, drafting };
}
