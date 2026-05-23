'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'RESCHEDULED'
  | 'CANCELLED';

export interface Appointment {
  id: string;
  leadId: string;
  scheduledAt: string;
  durationMin: number;
  surveyType: string;
  siteAddress: string;
  siteLat: string | null;
  siteLng: string | null;
  assignedEngineerId: string | null;
  status: AppointmentStatus;
  confirmedAt: string | null;
  completedAt: string | null;
  noShowAt: string | null;
  estimatedKw: string | null;
  roofCondition: string | null;
  cancelReason: string | null;
  postNotes: string | null;
  lead?: { name: string; phone: string };
}

interface AppointmentsResponse {
  data: { appointments: Appointment[]; nextCursor: string | null; hasMore: boolean };
}

interface AppointmentsParams {
  leadId?: string;
  status?: string;
  engineerId?: string;
  from?: string;
  to?: string;
}

export function useAppointments(params?: AppointmentsParams) {
  return useQuery({
    queryKey: ['appointments', params ?? {}],
    queryFn: () =>
      api
        .get<AppointmentsResponse>('/appointments', { params: params ?? {} })
        .then((r) => r.data.data.appointments),
  });
}

export function useTodayAppointments() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return useAppointments({ from, to });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: ['appointment', id],
    queryFn: () =>
      api
        .get<{ data: Appointment & { lead: { name: string; phone: string; city: string; stage: string } } }>(
          `/appointments/${id}`,
        )
        .then((r) => r.data.data),
    enabled: !!id,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['appointments'] });
}

export function useConfirmAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/confirm`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useNoShowAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/no-show`),
    onSuccess: () => invalidateAll(qc),
  });
}

export interface CompletePayload {
  id: string;
  estimatedKw?: number;
  roofCondition?: string;
  postNotes?: string;
  readyToQuote?: boolean;
}

export function useCompleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CompletePayload) =>
      api.post(`/appointments/${id}/complete`, body),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post(`/appointments/${id}/cancel`, { reason }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useReassignAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, engineerId }: { id: string; engineerId: string }) =>
      api.post(`/appointments/${id}/reassign`, { engineerId }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      api.patch(`/appointments/${id}`, { scheduledAt }),
    onSuccess: () => invalidateAll(qc),
  });
}

// ─── Slot picker ──────────────────────────────────────────────────────────────

export interface EngineerSlots {
  engineerId: string;
  engineerName: string;
  availableSlots: string[];
  bookedCount: number;
}

export interface SlotsResponse {
  date: string;
  durationMin: number;
  engineers: EngineerSlots[];
}

export function useAppointmentSlots(date: string | null, durationMin: number) {
  return useQuery({
    queryKey: ['appointment-slots', date, durationMin],
    queryFn: () =>
      api
        .get<{ data: SlotsResponse }>('/appointments/slots', { params: { date, durationMin } })
        .then((r) => r.data.data),
    enabled: !!date,
    staleTime: 60_000,
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateAppointmentInput {
  leadId: string;
  scheduledAt: string;
  surveyType: string;
  siteAddress: string;
  durationMin?: number;
  assignedEngineerId?: string;
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAppointmentInput) => api.post('/appointments', data),
    onSuccess: () => invalidateAll(qc),
  });
}
