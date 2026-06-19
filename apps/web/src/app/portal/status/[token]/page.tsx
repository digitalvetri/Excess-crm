import { Sun, Check, Clock, CalendarClock, ImageOff, Wrench, Star } from 'lucide-react';
import { IssueForm } from './issue-form';

export const dynamic = 'force-dynamic';

const STAGES = ['SURVEY', 'DESIGN', 'MATERIAL_ORDERED', 'INSTALLATION', 'COMMISSIONING', 'HANDED_OVER'] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  SURVEY: 'Site Survey',
  DESIGN: 'System Design',
  MATERIAL_ORDERED: 'Material Procurement',
  INSTALLATION: 'Installation',
  COMMISSIONING: 'Commissioning',
  HANDED_OVER: 'Handover',
};

const STAGE_DATE_FIELD: Record<Stage, keyof PortalProject> = {
  SURVEY: 'surveyDoneAt',
  DESIGN: 'designApprovedAt',
  MATERIAL_ORDERED: 'materialOrderedAt',
  INSTALLATION: 'installStartedAt',
  COMMISSIONING: 'commissionedAt',
  HANDED_OVER: 'handedOverAt',
};

interface PortalPhoto {
  stage: string;
  url: string;
  caption?: string;
}

interface PortalServiceTicket {
  type: string;
  subject: string;
  status: string;
  scheduledVisitAt: string | null;
}

interface PortalProject {
  number: string;
  stage: Stage;
  stageChangedAt: string;
  systemKw: string;
  surveyDoneAt: string | null;
  designApprovedAt: string | null;
  materialOrderedAt: string | null;
  installStartedAt: string | null;
  commissionedAt: string | null;
  handedOverAt: string | null;
  photos: PortalPhoto[];
  lead: { name: string; city: string | null };
  serviceTickets: PortalServiceTicket[];
}

async function fetchProject(token: string): Promise<PortalProject | null> {
  const apiUrl = process.env['INTERNAL_API_URL'] ?? 'http://localhost:8000';
  try {
    const res = await fetch(`${apiUrl}/api/v1/portal/project/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: PortalProject };
    return json.data ?? null;
  } catch {
    return null;
  }
}

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-primary text-white">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-2">
          <Sun size={20} className="text-accent" />
          <span className="font-bold">Excess Renew</span>
          <span className="text-white/60 text-sm ml-1">Solar</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-8">{children}</main>
      <footer className="max-w-2xl mx-auto px-5 py-8 text-center text-xs text-slate-400">
        Excess Renew Tech Pvt Ltd · This is a private project status link.
      </footer>
    </div>
  );
}

export default async function PortalStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const project = await fetchProject(token);

  if (!project) {
    return (
      <PortalShell>
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Clock size={28} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-800">Link unavailable</h1>
          <p className="text-sm text-slate-500 mt-1">
            This status link is invalid or has expired. Please contact Excess Renew for a fresh link.
          </p>
        </div>
      </PortalShell>
    );
  }

  const currentIndex = STAGES.indexOf(project.stage);

  return (
    <PortalShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Hello {project.lead.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Here is the live status of your solar installation.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Project</p>
              <p className="font-semibold text-slate-800">{project.number}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wide">System Size</p>
              <p className="font-semibold text-slate-800">
                {parseFloat(project.systemKw).toLocaleString('en-IN')} kW
              </p>
            </div>
          </div>
        </div>

        {/* Stage timeline */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Installation Progress</h2>
          <ol className="space-y-0">
            {STAGES.map((stage, idx) => {
              const done = idx < currentIndex;
              const current = idx === currentIndex;
              const date = fmtDate(project[STAGE_DATE_FIELD[stage]] as string | null);
              return (
                <li key={stage} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        done
                          ? 'bg-success text-white'
                          : current
                            ? 'bg-primary text-white'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {done ? <Check size={15} /> : <span className="text-xs font-semibold">{idx + 1}</span>}
                    </div>
                    {idx < STAGES.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[28px] ${done ? 'bg-success' : 'bg-slate-100'}`} />
                    )}
                  </div>
                  <div className="pb-5">
                    <p
                      className={`text-sm font-medium ${
                        current ? 'text-primary' : done ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      {STAGE_LABEL[stage]}
                    </p>
                    {current && <p className="text-xs text-primary/70">In progress</p>}
                    {date && <p className="text-xs text-slate-400">{date}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Upcoming visits */}
        {project.serviceTickets.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Service & Visits</h2>
            <div className="space-y-2">
              {project.serviceTickets.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CalendarClock size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-700">{t.subject}</span>
                  {t.scheduledVisitAt && (
                    <span className="text-xs text-slate-400 ml-auto">
                      {fmtDate(t.scheduledVisitAt)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Site Photos</h2>
          {project.photos.length === 0 ? (
            <div className="text-center py-6">
              <ImageOff size={22} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Photos will appear here as work progresses.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {project.photos.map((photo, i) => (
                <div key={i} className="rounded-lg overflow-hidden border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.caption ?? 'Site photo'} className="w-full h-28 object-cover" />
                  {photo.caption && (
                    <p className="text-[11px] text-slate-500 px-2 py-1 truncate">{photo.caption}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Report an Issue — show for all stages except SURVEY */}
        {project.stage !== 'SURVEY' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Wrench size={16} className="text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">Report an Issue</h2>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Having a problem? Let us know and our team will reach out to you.
            </p>
            <IssueForm token={token} />
          </div>
        )}

        {/* Rate Us — show only after handover */}
        {project.stage === 'HANDED_OVER' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} size={22} className="fill-[#F39C12] text-[#F39C12]" />
              ))}
            </div>
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Happy with our work?</h2>
            <p className="text-xs text-slate-400 mb-4">
              Your review helps others in your area discover clean solar energy.
            </p>
            <a
              href="https://g.page/r/excess-renew-solar"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#F39C12] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d68910]"
            >
              Leave a Google Review
            </a>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
