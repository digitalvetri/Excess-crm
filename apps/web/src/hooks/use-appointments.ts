'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Appointment {
  id: string;
  leadId: string;
  scheduledAt: string;
  surveyType: string;
  siteAddress: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELLED';
  durationMin: number;
  assignedEngineerId: string | null;
  lead?: { name: string; phone: string };
}

interface AppointmentsResponse {
  data: Appointment[];
}

export function useAppointments(leadId?: string) {
  return useQuery({
    queryKey: ['appointments', { leadId }],
    queryFn: () =>
      api
        .get<AppointmentsResponse>('/appointments', {
          params: leadId ? { leadId } : {},
        })
        .then((r) => r.data.data),
    enabled: true,
  });
}
