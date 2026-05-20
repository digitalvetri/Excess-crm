'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ProjectStage =
  | 'SURVEY'
  | 'DESIGN'
  | 'MATERIAL_ORDERED'
  | 'INSTALLATION'
  | 'COMMISSIONING'
  | 'HANDED_OVER';

export const PROJECT_STAGES: ProjectStage[] = [
  'SURVEY',
  'DESIGN',
  'MATERIAL_ORDERED',
  'INSTALLATION',
  'COMMISSIONING',
  'HANDED_OVER',
];

export const STAGE_LABEL: Record<ProjectStage, string> = {
  SURVEY: 'Survey',
  DESIGN: 'Design',
  MATERIAL_ORDERED: 'Material Ordered',
  INSTALLATION: 'Installation',
  COMMISSIONING: 'Commissioning',
  HANDED_OVER: 'Handed Over',
};

export interface ProjectListItem {
  id: string;
  number: string;
  stage: ProjectStage;
  stageChangedAt: string;
  systemKw: string;
  totalValueInr: string;
  assignedEngineerId: string | null;
  commissionedAt: string | null;
  handedOverAt: string | null;
  createdAt: string;
  lead: { id: string; name: string; phone: string; city: string | null };
}

export interface ProjectPhoto {
  stage: string;
  url: string;
  caption?: string;
  addedAt?: string;
}

export interface ProjectServiceTicket {
  id: string;
  type: string;
  subject: string;
  status: string;
  priority: string;
  scheduledVisitAt: string | null;
  createdAt: string;
}

export interface ProjectDetail {
  id: string;
  number: string;
  stage: ProjectStage;
  stageChangedAt: string;
  systemKw: string;
  totalValueInr: string;
  quotationId: string | null;
  surveyAppointmentId: string | null;
  assignedEngineerId: string | null;
  surveyDoneAt: string | null;
  designApprovedAt: string | null;
  materialOrderedAt: string | null;
  installStartedAt: string | null;
  commissionedAt: string | null;
  handedOverAt: string | null;
  photos: ProjectPhoto[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lead: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  };
  serviceTickets: ProjectServiceTicket[];
}

export function useProjects(filters?: { stage?: string; search?: string }) {
  return useQuery({
    queryKey: ['projects', filters ?? {}],
    queryFn: () =>
      api
        .get<{ data: { projects: ProjectListItem[]; hasMore: boolean; nextCursor: string | null } }>(
          '/projects',
          { params: filters ?? {} },
        )
        .then((r) => r.data.data),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.get<{ data: ProjectDetail }>(`/projects/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/projects/${id}`, data).then((r) => r.data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['projects', vars.id] });
    },
  });
}
