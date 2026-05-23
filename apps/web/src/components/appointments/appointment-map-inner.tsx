'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { MapPin, Navigation, Calendar, RefreshCw, ChevronDown } from 'lucide-react';
import {
  useAppointments,
  useReassignAppointment,
  type Appointment,
  type AppointmentStatus,
} from '@/hooks/use-appointments';
import { useUsers } from '@/hooks/use-teams';

// ── Leaflet icon fix (webpack strips _getIconUrl) ────────────────────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

// ── Constants ─────────────────────────────────────────────────────────────────
const COIMBATORE: [number, number] = [11.0168, 76.9558];

const ENGINEER_PALETTE = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

const STATUS_CFG: Record<AppointmentStatus, { color: string; label: string }> = {
  SCHEDULED:   { color: '#3B82F6', label: 'Scheduled' },
  CONFIRMED:   { color: '#10B981', label: 'Confirmed' },
  COMPLETED:   { color: '#6B7280', label: 'Completed' },
  NO_SHOW:     { color: '#EF4444', label: 'No-Show' },
  RESCHEDULED: { color: '#8B5CF6', label: 'Rescheduled' },
  CANCELLED:   { color: '#9CA3AF', label: 'Cancelled' },
};

// ── Icon factory ──────────────────────────────────────────────────────────────
function pinIcon(color: string, pulse = false) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.27 21.73 0 14 0z"
      fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="white" fill-opacity="0.9"/>
  </svg>`;
  const pulseHtml = pulse
    ? `<span style="position:absolute;top:-4px;left:-4px;width:36px;height:36px;border-radius:50%;background:${color};opacity:0.35;animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;pointer-events:none;"></span>`
    : '';
  return L.divIcon({
    html: `<div style="position:relative;width:28px;height:36px;">${pulseHtml}${svg}</div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -38],
    className: '',
  });
}

// ── Geocoding ─────────────────────────────────────────────────────────────────
async function nominatim(address: string): Promise<[number, number] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address + ', Coimbatore, Tamil Nadu, India')}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ExcessCRM/1.0' } });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    return null;
  } catch {
    return null;
  }
}

function useGeocoderCache(appointments: Appointment[]) {
  const [coords, setCoords] = useState<Record<string, [number, number]>>({});
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    for (const a of appointments) {
      if (a.siteLat && a.siteLng) continue;
      if (coords[a.id] || inflight.current.has(a.id)) continue;
      inflight.current.add(a.id);
      nominatim(a.siteAddress).then((ll) => {
        if (ll) setCoords((prev) => ({ ...prev, [a.id]: ll }));
        inflight.current.delete(a.id);
      });
    }
  }, [appointments, coords]);

  return useCallback(
    (a: Appointment): [number, number] | null => {
      if (a.siteLat && a.siteLng) return [parseFloat(a.siteLat), parseFloat(a.siteLng)];
      return coords[a.id] ?? null;
    },
    [coords],
  );
}

// ── Map pan helper (child component that can call useMap) ────────────────────
function MapPanner({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [map, target]);
  return null;
}

// ── Date range options ────────────────────────────────────────────────────────
type DateRange = 'today' | 'week' | 'all';

function dateRangeParams(range: DateRange): { from?: string; to?: string } {
  const now = new Date();
  if (range === 'today') {
    return {
      from: startOfDay(now).toISOString(),
      to: endOfDay(now).toISOString(),
    };
  }
  if (range === 'week') {
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      to: endOfWeek(addDays(now, 1), { weekStartsOn: 1 }).toISOString(),
    };
  }
  return {};
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AppointmentMapInner() {
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [panTarget, setPanTarget]   = useState<[number, number] | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const { data = [], isLoading, refetch } = useAppointments(dateRangeParams(dateRange));
  const { data: users = [] } = useUsers();
  const reassign = useReassignAppointment();

  const engineers = useMemo(
    () => users.filter((u) => u.role === 'ENGINEER'),
    [users],
  );

  const engineerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    engineers.forEach((e, i) => { map[e.id] = ENGINEER_PALETTE[i % ENGINEER_PALETTE.length]!; });
    return map;
  }, [engineers]);

  const getCoords = useGeocoderCache(data);

  // Grouped by engineer for polylines
  const engineerRoutes = useMemo(() => {
    const routes: Record<string, { coords: [number, number][]; color: string }> = {};
    const sorted = [...data].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
    for (const a of sorted) {
      if (!a.assignedEngineerId) continue;
      const ll = getCoords(a);
      if (!ll) continue;
      const color = engineerColorMap[a.assignedEngineerId] ?? '#6B7280';
      if (!routes[a.assignedEngineerId]) {
        routes[a.assignedEngineerId] = { coords: [], color };
      }
      routes[a.assignedEngineerId]!.coords.push(ll);
    }
    return routes;
  }, [data, getCoords, engineerColorMap]);

  function focusAppointment(a: Appointment) {
    const ll = getCoords(a);
    setHighlighted(a.id);
    if (ll) setPanTarget(ll);
  }

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[520px] overflow-hidden rounded-2xl border border-border shadow-sm">
      {/* ── Left panel ─────────────────────────────────────────────── */}
      <div className="flex w-[36%] shrink-0 flex-col border-r border-border bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary" />
            <span className="text-sm font-semibold text-slate-700">
              {data.length} appointment{data.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Date range toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
              {(['today', 'week', 'all'] as DateRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-2.5 py-1.5 capitalize transition-colors ${
                    dateRange === r
                      ? 'bg-primary text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {r === 'today' ? 'Today' : r === 'week' ? 'Week' : 'All'}
                </button>
              ))}
            </div>
            <button
              onClick={() => void refetch()}
              className="rounded-lg border border-border p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center p-6">
            <Calendar size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-400">No appointments in this range</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {[...data]
              .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
              .map((a) => {
                const cfg = STATUS_CFG[a.status];
                const engineerColor = a.assignedEngineerId
                  ? (engineerColorMap[a.assignedEngineerId] ?? '#9CA3AF')
                  : '#9CA3AF';
                const engineer = engineers.find((e) => e.id === a.assignedEngineerId);
                const isActive = highlighted === a.id;
                const ll = getCoords(a);

                return (
                  <button
                    key={a.id}
                    onClick={() => focusAppointment(a)}
                    className={`w-full rounded-xl border text-left px-3 py-2.5 transition-all ${
                      isActive
                        ? 'border-primary/40 bg-primary/5 shadow-sm'
                        : 'border-transparent hover:border-border hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Status dot */}
                      <div
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: cfg.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-sm font-semibold text-slate-800">
                            {a.lead?.name ?? 'Unknown'}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {format(new Date(a.scheduledAt), 'h:mm a')}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{a.siteAddress}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                            style={{ background: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                          {engineer ? (
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: engineerColor }}
                              />
                              {engineer.name}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-amber-500">Unassigned</span>
                          )}
                          {!ll && (
                            <span className="text-[10px] text-slate-300 italic">geocoding…</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        )}

        {/* Legend */}
        <div className="border-t border-border px-3 py-2.5 bg-slate-50">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Pin Colour
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(Object.entries(STATUS_CFG) as [AppointmentStatus, { color: string; label: string }][]).map(
              ([, cfg]) => (
                <span key={cfg.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: cfg.color }} />
                  {cfg.label}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {/* ── Leaflet map ──────────────────────────────────────────────── */}
      <div className="relative flex-1">
        <MapContainer
          center={COIMBATORE}
          zoom={12}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />

          <MapPanner target={panTarget} />

          {/* Route polylines per engineer */}
          {Object.entries(engineerRoutes).map(([engineerId, route]) =>
            route.coords.length >= 2 ? (
              <Polyline
                key={engineerId}
                positions={route.coords}
                pathOptions={{
                  color: route.color,
                  weight: 2.5,
                  opacity: 0.65,
                  dashArray: '6 4',
                }}
              />
            ) : null,
          )}

          {/* Appointment pins */}
          {data.map((a) => {
            const ll = getCoords(a);
            if (!ll) return null;
            const cfg = STATUS_CFG[a.status];
            const isUnassigned = !a.assignedEngineerId;
            const icon = pinIcon(cfg.color, isUnassigned);
            const engineer = engineers.find((e) => e.id === a.assignedEngineerId);

            return (
              <Marker key={a.id} position={ll} icon={icon}>
                <Popup minWidth={240} maxWidth={280}>
                  <AppointmentPopup
                    appointment={a}
                    engineer={engineer}
                    cfg={cfg}
                    engineers={engineers}
                    engineerColorMap={engineerColorMap}
                    onReassign={(engineerId) => {
                      reassign.mutate({ id: a.id, engineerId });
                    }}
                  />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Engineer route legend */}
        {engineers.filter((e) => engineerRoutes[e.id]).length > 0 && (
          <div className="absolute bottom-4 right-4 z-[999] rounded-xl border border-border bg-white/95 backdrop-blur-sm px-3 py-2.5 shadow-md">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Engineer Routes
            </p>
            <div className="space-y-1">
              {engineers
                .filter((e) => engineerRoutes[e.id])
                .map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                    <span
                      className="h-2 w-6 rounded-full"
                      style={{ background: engineerColorMap[e.id] }}
                    />
                    {e.name}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Appointment popup ─────────────────────────────────────────────────────────
interface PopupProps {
  appointment: Appointment;
  engineer: { id: string; name: string } | undefined;
  cfg: { color: string; label: string };
  engineers: Array<{ id: string; name: string; role: string }>;
  engineerColorMap: Record<string, string>;
  onReassign: (engineerId: string) => void;
}

function AppointmentPopup({
  appointment: a,
  engineer,
  cfg,
  engineers,
  engineerColorMap,
  onReassign,
}: PopupProps) {
  const [reassigning, setReassigning] = useState(false);
  const [selected, setSelected] = useState(a.assignedEngineerId ?? '');
  const canReassign = a.status !== 'COMPLETED' && a.status !== 'CANCELLED';

  return (
    <div className="min-w-[220px] text-slate-800">
      {/* Status badge */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ background: cfg.color }}
        >
          {cfg.label}
        </span>
        <span className="text-[11px] text-slate-400">
          {format(new Date(a.scheduledAt), 'EEE d MMM · h:mm a')}
        </span>
      </div>

      {/* Lead */}
      <div className="mb-1 font-semibold text-slate-800">{a.lead?.name ?? '—'}</div>
      <div className="mb-0.5 flex items-start gap-1 text-xs text-slate-500">
        <MapPin size={12} className="mt-0.5 shrink-0" />
        {a.siteAddress}
      </div>
      {a.lead?.phone && (
        <div className="mb-2 flex items-center gap-1 text-xs text-slate-500">
          <Navigation size={11} className="shrink-0" />
          {a.lead.phone}
        </div>
      )}

      {/* Survey type + duration */}
      <div className="mb-3 text-xs text-slate-400">
        {a.surveyType} · {a.durationMin} min
      </div>

      {/* Engineer / reassign */}
      {canReassign && (
        <div>
          {reassigning ? (
            <div className="space-y-2">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— Unassigned —</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    if (selected) onReassign(selected);
                    setReassigning(false);
                  }}
                  className="flex-1 rounded-lg bg-primary px-2 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                >
                  Assign
                </button>
                <button
                  onClick={() => setReassigning(false)}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setReassigning(true)}
              className="flex w-full items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                {engineer ? (
                  <>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: engineerColorMap[engineer.id] }}
                    />
                    {engineer.name}
                  </>
                ) : (
                  <span className="text-amber-500 font-medium">Unassigned</span>
                )}
              </span>
              <ChevronDown size={12} className="text-slate-400" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
