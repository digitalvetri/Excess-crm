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

export type SubsidyScheme  = 'NONE' | 'PM_SURYA_GHAR' | 'STATE_TEDA' | 'STATE_OTHER';
export type SubsidyStatus  = 'NOT_APPLIED' | 'APPLIED' | 'DISCOM_INSPECTION_SCHEDULED' | 'DISCOM_APPROVED' | 'PORTAL_UPLOAD_DONE' | 'CREDITED';
export type NetMeteringStatus = 'NOT_APPLIED' | 'SLD_SUBMITTED' | 'LOAD_SANCTION_APPLIED' | 'INSPECTION_DONE' | 'METER_CHANGED' | 'GRID_SYNCED' | 'ACTIVE';
export type ProjectDocumentCategory = 'QUOTATION' | 'WORK_ORDER' | 'MEASUREMENT_SHEET' | 'DESIGN_LAYOUT' | 'PURCHASE_ORDER' | 'COMMISSIONING_CERT' | 'NET_METERING_APPROVAL' | 'SUBSIDY_APPROVAL' | 'WARRANTY_CARD' | 'HANDOVER_CERT' | 'OTHER';
export type ProjectPaymentType = 'ADVANCE' | 'MATERIALS' | 'INSTALLATION' | 'COMPLETION' | 'SUBSIDY' | 'AMC' | 'OTHER';

export const PROJECT_STAGES: ProjectStage[] = [
  'SURVEY',
  'DESIGN',
  'MATERIAL_ORDERED',
  'INSTALLATION',
  'COMMISSIONING',
  'HANDED_OVER',
];

export const STAGE_LABEL: Record<ProjectStage, string> = {
  SURVEY:           'Survey',
  DESIGN:           'Design',
  MATERIAL_ORDERED: 'Material Ordered',
  INSTALLATION:     'Installation',
  COMMISSIONING:    'Commissioning',
  HANDED_OVER:      'Handed Over',
};

export const SUBSIDY_SCHEME_LABEL: Record<SubsidyScheme, string> = {
  NONE:          'No Subsidy',
  PM_SURYA_GHAR: 'PM Surya Ghar',
  STATE_TEDA:    'State / TEDA',
  STATE_OTHER:   'Other State',
};

export const SUBSIDY_STATUS_LABEL: Record<SubsidyStatus, string> = {
  NOT_APPLIED:                  'Not Applied',
  APPLIED:                      'Applied',
  DISCOM_INSPECTION_SCHEDULED:  'DISCOM Inspection Scheduled',
  DISCOM_APPROVED:              'DISCOM Approved',
  PORTAL_UPLOAD_DONE:           'Portal Upload Done',
  CREDITED:                     'Credited',
};

export const NM_STATUS_LABEL: Record<NetMeteringStatus, string> = {
  NOT_APPLIED:           'Not Applied',
  SLD_SUBMITTED:         'SLD Submitted',
  LOAD_SANCTION_APPLIED: 'Load Sanction Applied',
  INSPECTION_DONE:       'Inspection Done',
  METER_CHANGED:         'Meter Changed',
  GRID_SYNCED:           'Grid Synced',
  ACTIVE:                'Active',
};

export const DOC_CATEGORY_LABEL: Record<ProjectDocumentCategory, string> = {
  QUOTATION:            'Quotation',
  WORK_ORDER:           'Work Order',
  MEASUREMENT_SHEET:    'Measurement Sheet',
  DESIGN_LAYOUT:        'Design & Layout',
  PURCHASE_ORDER:       'Purchase Order',
  COMMISSIONING_CERT:   'Commissioning Certificate',
  NET_METERING_APPROVAL:'Net Metering Approval',
  SUBSIDY_APPROVAL:     'Subsidy Approval',
  WARRANTY_CARD:        'Warranty Card',
  HANDOVER_CERT:        'Handover Certificate',
  OTHER:                'Other',
};

export const PAYMENT_TYPE_LABEL: Record<ProjectPaymentType, string> = {
  ADVANCE:      'Advance',
  MATERIALS:    'Materials',
  INSTALLATION: 'Installation',
  COMPLETION:   'Completion',
  SUBSIDY:      'Subsidy',
  AMC:          'AMC',
  OTHER:        'Other',
};

// ── Data interfaces ───────────────────────────────────────────────────────────

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
  expectedCompletionAt: string | null;
  subsidyScheme: SubsidyScheme;
  subsidyStatus: SubsidyStatus;
  netMeteringStatus: NetMeteringStatus;
  createdAt: string;
  lead: { id: string; name: string; phone: string; city: string | null };
  payments: { amountInr: string }[];
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

export interface ProjectDocument {
  id: string;
  category: ProjectDocumentCategory;
  name: string;
  s3Key: string;
  sizeBytes: number | null;
  mimeType: string | null;
  uploadedByUserId: string;
  createdAt: string;
}

export interface ProjectPayment {
  id: string;
  type: ProjectPaymentType;
  amountInr: string;
  receivedAt: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recordedByUserId: string;
  createdAt: string;
}

export interface GenerationReading {
  month: string;       // "YYYY-MM"
  kwhGenerated: number;
  recordedAt: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  doneAt?: string;
}

export type StageChecklists = Partial<Record<ProjectStage, ChecklistItem[]>>;

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
  expectedCompletionAt: string | null;
  // Warranty
  panelWarrantyYears: number;
  inverterWarrantyYears: number;
  installWarrantyYears: number;
  warrantyStartDate: string | null;
  amcExpiresAt: string | null;
  // Subsidy
  subsidyScheme: SubsidyScheme;
  subsidyStatus: SubsidyStatus | null;
  subsidyAppRef: string | null;
  subsidyExpectedAmtInr: string | null;
  subsidyAppliedAt: string | null;
  subsidyInspectionAt: string | null;
  subsidyApprovedAt: string | null;
  subsidyPortalUploadAt: string | null;
  subsidyCreditedAt: string | null;
  subsidyCreditedAmtInr: string | null;
  // Net metering
  netMeteringStatus: NetMeteringStatus | null;
  netMeteringAppRef: string | null;
  netMeteringMeterNumber: string | null;
  netMeteringInspectorName: string | null;
  netMeteringSldAt: string | null;
  netMeteringLoadAt: string | null;
  netMeteringInspectionAt: string | null;
  netMeteringMeterAt: string | null;
  netMeteringGridSyncAt: string | null;
  netMeteringFirstExportAt: string | null;
  // JSON
  stageChecklists: StageChecklists;
  generationLog: GenerationReading[];
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
  documents: ProjectDocument[];
  payments: ProjectPayment[];
}

export interface ProjectStats {
  total: number;
  byStage: Record<ProjectStage, number>;
  completedRevenue: string | number;
  totalCompleted: number;
  completedThisMonth: number;
}

// ── Query hooks ───────────────────────────────────────────────────────────────

export function useProjects(filters?: { stage?: string; search?: string; engineerId?: string; subsidyStatus?: string; netMeteringStatus?: string }) {
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

export function useProjectStats() {
  return useQuery({
    queryKey: ['projects', 'stats'],
    queryFn: () =>
      api.get<{ data: ProjectStats }>('/projects/stats').then((r) => r.data.data),
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

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

export interface SubsidyUpdateData {
  subsidyScheme?: SubsidyScheme;
  subsidyStatus?: SubsidyStatus;
  subsidyAppRef?: string | null;
  subsidyExpectedAmtInr?: number | null;
  subsidyAppliedAt?: string | null;
  subsidyInspectionAt?: string | null;
  subsidyApprovedAt?: string | null;
  subsidyPortalUploadAt?: string | null;
  subsidyCreditedAt?: string | null;
  subsidyCreditedAmtInr?: number | null;
}

export interface NetMeteringUpdateData {
  netMeteringStatus?: NetMeteringStatus;
  netMeteringAppRef?: string | null;
  netMeteringMeterNumber?: string | null;
  netMeteringInspectorName?: string | null;
  netMeteringSldAt?: string | null;
  netMeteringLoadAt?: string | null;
  netMeteringInspectionAt?: string | null;
  netMeteringMeterAt?: string | null;
  netMeteringGridSyncAt?: string | null;
  netMeteringFirstExportAt?: string | null;
}

export function useUpdateSubsidy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SubsidyUpdateData }) =>
      api.patch(`/projects/${id}/subsidy`, data).then((r) => r.data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.id] });
    },
  });
}

export function useUpdateNetMetering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: NetMeteringUpdateData }) =>
      api.patch(`/projects/${id}/net-metering`, data).then((r) => r.data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.id] });
    },
  });
}

export function useUpdateChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage, itemId, label, done }: { id: string; stage: string; itemId: string; label?: string; done: boolean }) =>
      api.patch(`/projects/${id}/checklist`, { stage, itemId, label, done }).then((r) => r.data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.id] });
    },
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file, category, name }: { id: string; file: File; category: string; name: string }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);
      form.append('name', name);
      return api.post<{ data: ProjectDocument }>(`/projects/${id}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data.data);
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.id] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, docId }: { projectId: string; docId: string }) =>
      api.delete(`/projects/${projectId}/documents/${docId}`),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.projectId] });
    },
  });
}

export function useAddPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id, type, amountInr, receivedAt, method, reference, notes,
    }: {
      id: string;
      type: ProjectPaymentType;
      amountInr: number;
      receivedAt: string;
      method?: string;
      reference?: string;
      notes?: string;
    }) =>
      api
        .post<{ data: ProjectPayment }>(`/projects/${id}/payments`, {
          type, amountInr, receivedAt, method, reference, notes,
        })
        .then((r) => r.data.data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.id] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, payId }: { projectId: string; payId: string }) =>
      api.delete(`/projects/${projectId}/payments/${payId}`),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.projectId] });
    },
  });
}

export function useDocumentDownloadUrl() {
  return useMutation({
    mutationFn: ({ projectId, docId }: { projectId: string; docId: string }) =>
      api
        .get<{ data: { url: string; expiresInSeconds: number } }>(
          `/projects/${projectId}/documents/${docId}/download-url`,
        )
        .then((r) => r.data.data),
  });
}

export function useProjectPortalLink() {
  return useMutation({
    mutationFn: (id: string) =>
      api
        .get<{ data: { token: string; url: string } }>(`/projects/${id}/portal-link`)
        .then((r) => r.data.data),
  });
}

export function useAddGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, month, kwhGenerated }: { id: string; month: string; kwhGenerated: number }) =>
      api.post(`/projects/${id}/generation`, { month, kwhGenerated }).then((r) => r.data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.id] });
    },
  });
}

export function useDeleteGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, month }: { id: string; month: string }) =>
      api.delete(`/projects/${id}/generation/${month}`),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects', vars.id] });
    },
  });
}

export function useNotifyCustomer() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: { sent: boolean; stage: string } }>(`/projects/${id}/notify`, {}).then((r) => r.data.data),
  });
}
