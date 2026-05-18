'use client';

import { Suspense } from 'react';
import { format } from 'date-fns';
import { Calendar, MapPin, Clock, User } from 'lucide-react';
import { useAppointments } from '@/hooks/use-appointments';

export default function AppointmentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Scheduled site surveys and visits.</p>
        </div>
      </div>

      <Suspense fallback={<div className="h-96 bg-white rounded-xl animate-pulse" />}>
        <UpcomingAppointments />
      </Suspense>
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  SCHEDULED: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-700' },
  RESCHEDULED: { label: 'Rescheduled', className: 'bg-amber-100 text-amber-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500' },
};

const SURVEY_LABELS: Record<string, string> = {
  ROOFTOP_RESIDENTIAL: 'Rooftop Residential',
  COMMERCIAL: 'Commercial',
  INDUSTRIAL: 'Industrial',
  OFFGRID: 'Off-Grid',
};

function UpcomingAppointments() {
  const { data, isLoading, isError } = useAppointments();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 animate-pulse">
            <div className="w-24 h-4 bg-slate-200 rounded" />
            <div className="flex-1 h-4 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-danger">Failed to load appointments.</p>
      </div>
    );
  }

  const appointments = data ?? [];

  if (appointments.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-12 text-center">
        <Calendar className="mx-auto mb-3 text-slate-300" size={32} />
        <p className="text-slate-500 text-sm">No appointments scheduled yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="hidden md:grid grid-cols-[160px_1fr_160px_100px_80px] gap-4 px-5 py-2 bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
        <span>Date &amp; Time</span>
        <span>Lead / Address</span>
        <span>Type</span>
        <span>Duration</span>
        <span>Status</span>
      </div>
      <div className="divide-y divide-border">
        {appointments.map((appt) => {
          const statusCfg = STATUS_CONFIG[appt.status] ?? { label: appt.status, className: 'bg-slate-100 text-slate-600' };
          return (
            <div key={appt.id} className="grid grid-cols-1 md:grid-cols-[160px_1fr_160px_100px_80px] gap-2 md:gap-4 px-5 py-3">
              <div className="flex items-center gap-1 text-sm text-slate-700">
                <Calendar size={12} className="text-slate-400 shrink-0" />
                {format(new Date(appt.scheduledAt), 'dd MMM, h:mm a')}
              </div>
              <div className="min-w-0">
                {appt.lead && (
                  <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
                    <User size={12} className="text-slate-400 shrink-0" />
                    {appt.lead.name}
                  </p>
                )}
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate">{appt.siteAddress}</span>
                </p>
              </div>
              <div className="flex items-center text-xs text-slate-600">
                {SURVEY_LABELS[appt.surveyType] ?? appt.surveyType}
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Clock size={11} />
                {appt.durationMin} min
              </div>
              <div className="flex items-center">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                  {statusCfg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
