'use client';

import { format } from 'date-fns';
import { MapPin, Clock, User, AlertTriangle, ChevronRight } from 'lucide-react';
import { STATUS_CONFIG, SURVEY_CONFIG } from './appointment-drawer';
import type { Appointment } from '@/hooks/use-appointments';

interface AppointmentCardProps {
  appointment: Appointment;
  onClick: () => void;
}

export function AppointmentCard({ appointment, onClick }: AppointmentCardProps) {
  const statusCfg = STATUS_CONFIG[appointment.status] ?? STATUS_CONFIG['SCHEDULED']!;
  const surveyCfg = SURVEY_CONFIG[appointment.surveyType] ?? { label: appointment.surveyType, icon: '📋', colorClass: 'text-slate-600 bg-slate-50' };
  const isUnassigned = !appointment.assignedEngineerId && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status);
  const isPast = new Date(appointment.scheduledAt) < new Date() && appointment.status === 'SCHEDULED';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left group rounded-xl border bg-white transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0 border-l-4 ${statusCfg.borderClass} ${isPast ? 'border-border/80' : 'border-border'}`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Survey type icon */}
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${surveyCfg.colorClass}`}>
          {surveyCfg.icon}
        </span>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Row 1: lead name + status badge */}
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">
              {appointment.lead?.name ?? 'Unknown Lead'}
            </p>
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusCfg.badgeClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
              {statusCfg.label}
            </span>
          </div>

          {/* Row 2: survey type + time */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${surveyCfg.colorClass}`}>
              {surveyCfg.label}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {format(new Date(appointment.scheduledAt), 'h:mm a')}
              <span className="text-slate-400">· {appointment.durationMin}m</span>
            </span>
          </div>

          {/* Row 3: address */}
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{appointment.siteAddress}</span>
          </div>

          {/* Row 4: engineer / unassigned warning */}
          {isUnassigned ? (
            <div className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
              <AlertTriangle size={11} />
              Engineer not assigned
            </div>
          ) : appointment.assignedEngineerId ? (
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <User size={11} />
              <span className="truncate">Assigned</span>
            </div>
          ) : null}

          {/* Completed: show estimated kW */}
          {appointment.status === 'COMPLETED' && appointment.estimatedKw && (
            <p className="text-[11px] font-medium text-emerald-600">
              ⚡ {appointment.estimatedKw} kW estimated
            </p>
          )}
        </div>

        {/* Arrow */}
        <ChevronRight size={16} className="mt-2 shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors" />
      </div>
    </button>
  );
}
