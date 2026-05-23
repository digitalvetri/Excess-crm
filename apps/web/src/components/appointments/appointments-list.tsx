'use client';

import { format } from 'date-fns';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { useAppointments } from '@/hooks/use-appointments';

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

interface AppointmentsListProps {
  leadId: string;
}

export function AppointmentsList({ leadId }: AppointmentsListProps) {
  const { data, isLoading } = useAppointments({ leadId });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const appointments = data ?? [];

  if (appointments.length === 0) {
    return (
      <div className="text-center py-8">
        <Calendar className="mx-auto mb-2 text-slate-300" size={28} />
        <p className="text-sm text-slate-500">No appointments scheduled yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {appointments.map((appt) => {
        const statusCfg = STATUS_CONFIG[appt.status] ?? { label: appt.status, className: 'bg-slate-100 text-slate-600' };
        return (
          <div key={appt.id} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {SURVEY_LABELS[appt.surveyType] ?? appt.surveyType}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {format(new Date(appt.scheduledAt), 'dd MMM yyyy, h:mm a')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {appt.durationMin} min
                  </span>
                </div>
                <p className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                  <MapPin size={11} />
                  {appt.siteAddress}
                </p>
              </div>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                {statusCfg.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
